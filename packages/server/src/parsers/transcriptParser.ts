import type { MessageState } from '@agent-viewer/shared';

export interface ParsedTranscriptLine {
  type: 'message' | 'tool_call' | 'agent_activity' | 'compact' | 'thinking' | 'progress' | 'turn_end' | 'unknown';
  agentName?: string;
  toolName?: string;
  /** The raw tool name (e.g., 'AskUserQuestion') before description formatting */
  rawToolName?: string;
  message?: MessageState;
  /** True when this tool call always requires user input (e.g., AskUserQuestion) */
  isUserPrompt?: boolean;
}

export function extractToolUseBlocks(data: Record<string, unknown>): Array<{ name: string; id?: string; input?: Record<string, unknown> }> {
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

export function extractAgentName(data: Record<string, unknown>): string | undefined {
  if (typeof data.agentName === 'string') return data.agentName;
  if (typeof data.agent_name === 'string') return data.agent_name;
  if (data.metadata && typeof data.metadata === 'object') {
    const meta = data.metadata as Record<string, unknown>;
    if (typeof meta.agentName === 'string') return meta.agentName;
    if (typeof meta.agent_name === 'string') return meta.agent_name;
  }
  return undefined;
}

export function parseSendMessageInput(
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
  const recipient = typeof input.recipient === 'string' ? input.recipient : (msgType === 'broadcast' ? 'all' : undefined);

  // Don't emit messages with unknown sender — the hooks handler
  // (which has access to StateManager for name resolution) will capture these instead
  if (!agentName || !recipient) return null;
  const from = agentName;

  return {
    id: blockId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    to: recipient,
    content: summary || content.slice(0, 200),
    timestamp: Date.now(),
  };
}

/**
 * Create a human-readable description from a tool_use block.
 * e.g. "Editing watcher.ts" instead of just "Edit"
 */
export function describeToolAction(block: { name: string; input?: Record<string, unknown> }): string {
  const input = block.input;
  if (!input) return block.name;

  switch (block.name) {
    case 'Edit':
    case 'Write':
    case 'Read': {
      const fp = typeof input.file_path === 'string' ? input.file_path : '';
      const filename = fp.split('/').pop() || fp;
      const verb = block.name === 'Edit' ? 'Editing' : block.name === 'Write' ? 'Writing' : 'Reading';
      return filename ? `${verb} ${filename}` : block.name;
    }
    case 'Bash': {
      const cmd = typeof input.command === 'string' ? input.command : '';
      const desc = typeof input.description === 'string' ? input.description : '';
      if (desc) return desc.slice(0, 60);
      if (cmd) {
        const short = cmd.split('&&')[0].split('|')[0].trim().slice(0, 50);
        return `Running: ${short}`;
      }
      return 'Running command';
    }
    case 'Grep':
    case 'Glob': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : '';
      return pattern ? `Searching: ${pattern.slice(0, 40)}` : `Searching files`;
    }
    case 'Task': {
      const desc = typeof input.description === 'string' ? input.description : '';
      return desc ? `Spawning: ${desc.slice(0, 40)}` : 'Spawning agent';
    }
    case 'TaskCreate': {
      const subj = typeof input.subject === 'string' ? input.subject : '';
      return subj ? `Creating task: ${subj.slice(0, 40)}` : 'Creating task';
    }
    case 'TaskUpdate': {
      const status = typeof input.status === 'string' ? input.status : '';
      return status ? `Updating task → ${status}` : 'Updating task';
    }
    case 'SendMessage':
    case 'SendMessageTool': {
      const to = typeof input.recipient === 'string' ? input.recipient : 'team';
      return `Messaging ${to}`;
    }
    case 'WebSearch': {
      const q = typeof input.query === 'string' ? input.query : '';
      return q ? `Searching: ${q.slice(0, 40)}` : 'Web search';
    }
    case 'WebFetch': {
      return 'Fetching web page';
    }
    default:
      return block.name;
  }
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

  // Detect turn completion — definitive signal that a turn ended
  if (data.type === 'system' && data.subtype === 'turn_duration') {
    return { type: 'turn_end' };
  }

  // Detect conversation compacting (full compact or microcompact)
  if (data.type === 'system' && (data.subtype === 'compact_boundary' || data.subtype === 'microcompact_boundary')) {
    return { type: 'compact' };
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

  // Return first tool_use block as a tool_call event with descriptive action
  if (toolBlocks.length > 0) {
    const block = toolBlocks[0];
    // Tools that always require user input
    const userPromptTools = ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode'];
    return {
      type: 'tool_call',
      agentName,
      toolName: describeToolAction(block),
      rawToolName: block.name,
      isUserPrompt: userPromptTools.includes(block.name),
    };
  }

  // Detect tool results (agent activity indicator)
  if (data.type === 'tool_result' || data.type === 'tool_output') {
    return { type: 'agent_activity', agentName };
  }

  // Detect progress entries (bash_progress, hook_progress, etc.)
  // These indicate the tool is actively running — NOT waiting for user input
  if (data.type === 'progress') {
    const progressData = data.data as Record<string, unknown> | undefined;
    const progressType = progressData?.type;
    if (progressType === 'bash_progress') {
      return { type: 'progress', toolName: 'Running command...' };
    }
    if (progressType === 'agent_progress') {
      return { type: 'progress', toolName: 'Agent working...' };
    }
    if (progressType === 'hook_progress') {
      return { type: 'progress', toolName: 'Processing...' };
    }
    return { type: 'progress' };
  }

  // Detect assistant entries (thinking/responding between tool calls)
  if (data.type === 'assistant') {
    const msg = data.message as Record<string, unknown> | undefined;
    if (msg && Array.isArray(msg.content) && msg.content.length > 0) {
      const firstBlock = msg.content[0];
      if (firstBlock && typeof firstBlock === 'object') {
        const blockType = (firstBlock as Record<string, unknown>).type;
        if (blockType === 'thinking') {
          return { type: 'thinking', agentName, toolName: 'Thinking...' };
        }
        if (blockType === 'text') {
          return { type: 'thinking', agentName, toolName: 'Responding...' };
        }
        // 'tool_use' blocks are already handled by extractToolUseBlocks above
      }
    }
  }

  return { type: 'unknown', agentName };
}
