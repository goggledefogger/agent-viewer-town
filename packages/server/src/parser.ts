import { readFile } from 'fs/promises';
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
    return JSON.parse(raw) as TeamConfig;
  } catch {
    return null;
  }
}

export async function parseTaskFile(filePath: string): Promise<TaskState | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return {
      id: data.id ?? filePath.split('/').pop()?.replace('.json', '') ?? '',
      subject: data.subject ?? 'Untitled',
      status: data.status ?? 'pending',
      owner: data.owner,
      blockedBy: data.blockedBy ?? [],
      blocks: data.blocks ?? [],
    };
  } catch {
    return null;
  }
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

export function parseTranscriptLine(line: string): ParsedTranscriptLine | null {
  try {
    const data = JSON.parse(line);

    // Detect SendMessage tool calls
    if (data.type === 'tool_use' || data.type === 'assistant') {
      const content = data.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && block.name === 'SendMessage') {
            const input = block.input;
            if (input?.type === 'message' && input.recipient && input.content) {
              return {
                type: 'message',
                message: {
                  id: block.id || `msg-${Date.now()}`,
                  from: data.agentName || 'unknown',
                  to: input.recipient,
                  content: input.summary || input.content.slice(0, 200),
                  timestamp: Date.now(),
                },
              };
            }
          }
          if (block.type === 'tool_use') {
            return {
              type: 'tool_call',
              toolName: block.name,
            };
          }
        }
      }
    }

    // Detect tool results
    if (data.type === 'tool_result') {
      return { type: 'agent_activity' };
    }

    return { type: 'unknown' };
  } catch {
    return null;
  }
}

export async function readNewLines(filePath: string, fromByte: number): Promise<{ lines: string[]; newOffset: number }> {
  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(filePath);
    if (stats.size <= fromByte) {
      return { lines: [], newOffset: fromByte };
    }

    const { createReadStream } = await import('fs');
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath, { start: fromByte });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        const lines = text.split('\n').filter((l) => l.trim());
        resolve({ lines, newOffset: stats.size });
      });
      stream.on('error', () => resolve({ lines: [], newOffset: fromByte }));
    });
  } catch {
    return { lines: [], newOffset: fromByte };
  }
}
