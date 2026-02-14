/**
 * Tool action description — formats tool names and inputs into
 * human-readable action strings for the UI.
 */

export interface ActionDescription {
  action: string;
  context?: string;
}

/**
 * Describe a tool action in human-readable form with optional context.
 * Returns { action, context } where context is a secondary line
 * (directory path, file filter, etc.) shown below the primary action.
 */
export function describeToolAction(toolName: string, toolInput?: Record<string, unknown>): ActionDescription {
  if (!toolInput) return { action: toolName };

  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'Read': {
      const fp = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      const parts = fp.split('/');
      const filename = parts.pop() || fp;
      const dir = parts.slice(-2).join('/');
      const verb = toolName === 'Edit' ? 'Editing' : toolName === 'Write' ? 'Writing' : 'Reading';
      return {
        action: filename ? `${verb} ${filename}` : toolName,
        context: dir || undefined,
      };
    }
    case 'Bash': {
      const desc = typeof toolInput.description === 'string' ? toolInput.description : '';
      const cmd = typeof toolInput.command === 'string' ? toolInput.command : '';
      if (desc) return { action: desc.slice(0, 60) };
      if (cmd) {
        const short = cmd.split('&&')[0].split('|')[0].trim().slice(0, 50);
        return { action: `Running: ${short}` };
      }
      return { action: 'Running command' };
    }
    case 'Grep':
    case 'Glob': {
      const pattern = typeof toolInput.pattern === 'string' ? toolInput.pattern : '';
      const glob = typeof toolInput.glob === 'string' ? toolInput.glob : '';
      const path = typeof toolInput.path === 'string' ? toolInput.path : '';
      const dir = path ? path.split('/').slice(-2).join('/') : undefined;
      return {
        action: pattern ? `Searching: ${pattern.slice(0, 40)}` : 'Searching files',
        context: glob ? `in ${glob}` : dir ? `in ${dir}` : undefined,
      };
    }
    case 'Task': {
      const desc = typeof toolInput.description === 'string' ? toolInput.description : '';
      const subType = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type : '';
      return {
        action: desc ? `Spawning: ${desc.slice(0, 40)}` : 'Spawning agent',
        context: subType ? `(${subType})` : undefined,
      };
    }
    case 'TaskCreate': {
      const subj = typeof toolInput.subject === 'string' ? toolInput.subject : '';
      return { action: subj ? `Creating task: ${subj.slice(0, 40)}` : 'Creating task' };
    }
    case 'TaskUpdate': {
      const taskId = typeof toolInput.taskId === 'string' ? toolInput.taskId : '';
      const status = typeof toolInput.status === 'string' ? toolInput.status : '';
      if (status) return { action: `Task #${taskId}: ${status}` };
      return { action: `Updating task #${taskId}` };
    }
    case 'TaskList':
      return { action: 'Checking task list' };
    case 'SendMessage':
    case 'SendMessageTool': {
      const msgType = typeof toolInput.type === 'string' ? toolInput.type : 'message';
      const to = typeof toolInput.recipient === 'string' ? toolInput.recipient : 'team';
      if (msgType === 'broadcast') return { action: 'Broadcasting to team' };
      if (msgType === 'shutdown_request') return { action: `Requesting ${to} shutdown` };
      return { action: `Messaging ${to}` };
    }
    case 'TeamCreate': {
      const name = typeof toolInput.team_name === 'string' ? toolInput.team_name : '';
      return { action: name ? `Creating team: ${name}` : 'Creating team' };
    }
    case 'TeamDelete':
      return { action: 'Deleting team' };
    case 'WebSearch': {
      const q = typeof toolInput.query === 'string' ? toolInput.query : '';
      return { action: q ? `Searching: ${q.slice(0, 40)}` : 'Web search' };
    }
    case 'WebFetch':
      return { action: 'Fetching web page' };
    case 'EnterPlanMode':
      return { action: 'Entering plan mode' };
    case 'ExitPlanMode':
      return { action: 'Presenting plan for approval' };
    case 'AskUserQuestion':
      return { action: 'Asking user a question' };
    default:
      return { action: toolName };
  }
}
