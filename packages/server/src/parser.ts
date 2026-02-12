import { readFile, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import type { AgentState, AgentRole, TaskState, MessageState } from '@agent-viewer/shared';

export interface TeamConfig {
  members: Array<{
    name: string;
    agentId: string;
    agentType: string;
  }>;
}

export async function parseTeamConfig(filePath: string): Promise<TeamConfig | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.members)) {
      console.warn(`[parser] Invalid team config (missing members array): ${filePath}`);
      return null;
    }
    return data as TeamConfig;
  } catch (err) {
    if (isFileError(err) && err.code === 'ENOENT') {
      return null;
    }
    console.warn(`[parser] Failed to parse team config ${filePath}:`, errorMessage(err));
    return null;
  }
}

export async function parseTaskFile(filePath: string): Promise<TaskState | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    if (!raw.trim()) {
      return null; // Empty file, likely mid-write
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      console.warn(`[parser] Invalid task file (not an object): ${filePath}`);
      return null;
    }
    return {
      id: data.id ?? filePath.split('/').pop()?.replace('.json', '') ?? '',
      subject: data.subject ?? 'Untitled',
      status: normalizeTaskStatus(data.status),
      owner: data.owner,
      blockedBy: Array.isArray(data.blockedBy) ? data.blockedBy : [],
      blocks: Array.isArray(data.blocks) ? data.blocks : [],
    };
  } catch (err) {
    if (isFileError(err) && err.code === 'ENOENT') {
      return null;
    }
    console.warn(`[parser] Failed to parse task file ${filePath}:`, errorMessage(err));
    return null;
  }
}

function normalizeTaskStatus(status: unknown): TaskState['status'] {
  if (status === 'pending' || status === 'in_progress' || status === 'completed') {
    return status;
  }
  if (status === 'deleted') return 'completed';
  return 'pending';
}

export function inferRole(agentType: string, name: string): AgentRole {
  const lower = (agentType + ' ' + name).toLowerCase();
  if (lower.includes('lead') || lower.includes('team-lead')) return 'lead';
  if (lower.includes('research') || lower.includes('explore') || lower.includes('architect')) return 'researcher';
  if (lower.includes('test') || lower.includes('validat') || lower.includes('tester')) return 'tester';
  if (lower.includes('plan') || lower.includes('design') || lower.includes('artist') || lower.includes('scribe')) return 'planner';
  return 'implementer';
}

export function teamMemberToAgent(member: TeamConfig['members'][0]): AgentState {
  return {
    id: member.agentId,
    name: member.name,
    role: inferRole(member.agentType, member.name),
    status: 'idle',
    tasksCompleted: 0,
  };
}

export interface ParsedTranscriptLine {
  type: 'message' | 'tool_call' | 'agent_activity' | 'unknown';
  agentName?: string;
  toolName?: string;
  message?: MessageState;
}

function extractToolUseBlocks(data: Record<string, unknown>): Array<{ name: string; id?: string; input?: Record<string, unknown> }> {
  const blocks: Array<{ name: string; id?: string; input?: Record<string, unknown> }> = [];

  // Format 1: content is an array of blocks (assistant turn)
  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block && typeof block === 'object' && block.type === 'tool_use' && typeof block.name === 'string') {
        blocks.push({ name: block.name, id: block.id, input: block.input });
      }
    }
  }

  // Format 2: top-level tool_use entry
  if (data.type === 'tool_use' && typeof data.name === 'string') {
    blocks.push({ name: data.name as string, id: data.id as string | undefined, input: data.input as Record<string, unknown> | undefined });
  }

  // Format 3: nested inside a message wrapper
  if (data.message && typeof data.message === 'object') {
    const msg = data.message as Record<string, unknown>;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block === 'object' && block.type === 'tool_use' && typeof block.name === 'string') {
          blocks.push({ name: block.name, id: block.id, input: block.input });
        }
      }
    }
  }

  return blocks;
}

function extractAgentName(data: Record<string, unknown>): string | undefined {
  if (typeof data.agentName === 'string') return data.agentName;
  if (typeof data.agent_name === 'string') return data.agent_name;
  if (data.metadata && typeof data.metadata === 'object') {
    const meta = data.metadata as Record<string, unknown>;
    if (typeof meta.agentName === 'string') return meta.agentName;
    if (typeof meta.agent_name === 'string') return meta.agent_name;
  }
  return undefined;
}

function parseSendMessageInput(
  input: Record<string, unknown> | undefined,
  blockId: string | undefined,
  agentName: string | undefined
): MessageState | null {
  if (!input) return null;

  const msgType = input.type;
  if (msgType !== 'message' && msgType !== 'broadcast') return null;

  const content = typeof input.content === 'string' ? input.content : null;
  if (!content) return null;

  const summary = typeof input.summary === 'string' ? input.summary : undefined;
  const recipient = typeof input.recipient === 'string' ? input.recipient : (msgType === 'broadcast' ? 'all' : 'unknown');
  const from = agentName || 'unknown';

  return {
    id: blockId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    to: recipient,
    content: summary || content.slice(0, 200),
    timestamp: Date.now(),
  };
}

export function parseTranscriptLine(line: string): ParsedTranscriptLine | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const agentName = extractAgentName(data);
  const toolBlocks = extractToolUseBlocks(data);

  // Check for SendMessage calls first (highest priority)
  for (const block of toolBlocks) {
    if (block.name === 'SendMessage' || block.name === 'SendMessageTool') {
      const message = parseSendMessageInput(block.input, block.id, agentName);
      if (message) {
        return { type: 'message', agentName, message };
      }
    }
  }

  // Return first tool_use block as a tool_call event
  if (toolBlocks.length > 0) {
    return {
      type: 'tool_call',
      agentName,
      toolName: toolBlocks[0].name,
    };
  }

  // Detect tool results (agent activity indicator)
  if (data.type === 'tool_result' || data.type === 'tool_output') {
    return { type: 'agent_activity', agentName };
  }

  return { type: 'unknown', agentName };
}

export async function readNewLines(filePath: string, fromByte: number): Promise<{ lines: string[]; newOffset: number }> {
  try {
    const stats = await stat(filePath);
    if (stats.size <= fromByte) {
      // File may have been truncated/rewritten -- reset offset
      if (stats.size < fromByte) {
        return readNewLines(filePath, 0);
      }
      return { lines: [], newOffset: fromByte };
    }

    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath, { start: fromByte });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        // Only return complete lines; keep partial trailing line for next read
        const allLines = text.split('\n');
        const hasTrailingNewline = text.endsWith('\n');
        const completeLines = hasTrailingNewline ? allLines.filter((l) => l.trim()) : allLines.slice(0, -1).filter((l) => l.trim());
        const consumedBytes = hasTrailingNewline
          ? text.length
          : text.lastIndexOf('\n') + 1;

        resolve({
          lines: completeLines,
          newOffset: fromByte + consumedBytes,
        });
      });
      stream.on('error', (err) => {
        console.warn(`[parser] Error reading transcript ${filePath}:`, errorMessage(err));
        resolve({ lines: [], newOffset: fromByte });
      });
    });
  } catch (err) {
    if (isFileError(err) && err.code === 'ENOENT') {
      return { lines: [], newOffset: 0 };
    }
    console.warn(`[parser] Error stat-ing transcript ${filePath}:`, errorMessage(err));
    return { lines: [], newOffset: fromByte };
  }
}

interface FileError extends Error {
  code: string;
}

function isFileError(err: unknown): err is FileError {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
