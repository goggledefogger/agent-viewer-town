import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseTeamConfig,
  parseTaskFile,
  inferRole,
  teamMemberToAgent,
  parseTranscriptLine,
  parseSessionMetadata,
  cleanProjectName,
  readFirstLine,
  extractRecordType,
  detectGitWorktree,
} from '../parser';

const TMP = join(tmpdir(), 'avt-parser-test-' + Date.now());

beforeAll(async () => {
  await mkdir(TMP, { recursive: true });
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe('parseTeamConfig', () => {
  it('parses a valid team config JSON', async () => {
    const configPath = join(TMP, 'config.json');
    await writeFile(configPath, JSON.stringify({
      members: [
        { name: 'team-lead', agentId: 'a1', agentType: 'TeamLead' },
        { name: 'coder', agentId: 'a2', agentType: 'Implementer' },
      ],
    }));

    const result = await parseTeamConfig(configPath);
    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(2);
    expect(result!.members[0].name).toBe('team-lead');
  });

  it('returns null for missing file', async () => {
    const result = await parseTeamConfig(join(TMP, 'nonexistent.json'));
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    const badPath = join(TMP, 'bad.json');
    await writeFile(badPath, 'not json{{{');
    const result = await parseTeamConfig(badPath);
    expect(result).toBeNull();
  });
});

describe('parseTaskFile', () => {
  it('parses a valid task file', async () => {
    const taskPath = join(TMP, 'task-1.json');
    await writeFile(taskPath, JSON.stringify({
      id: '1',
      subject: 'Build feature',
      status: 'in_progress',
      owner: 'coder',
      blockedBy: [],
      blocks: ['2'],
    }));

    const task = await parseTaskFile(taskPath);
    expect(task).not.toBeNull();
    expect(task!.id).toBe('1');
    expect(task!.subject).toBe('Build feature');
    expect(task!.status).toBe('in_progress');
    expect(task!.owner).toBe('coder');
    expect(task!.blocks).toEqual(['2']);
  });

  it('provides defaults for missing fields', async () => {
    const taskPath = join(TMP, 'task-minimal.json');
    await writeFile(taskPath, JSON.stringify({}));

    const task = await parseTaskFile(taskPath);
    expect(task).not.toBeNull();
    expect(task!.subject).toBe('Untitled');
    expect(task!.status).toBe('pending');
    expect(task!.blockedBy).toEqual([]);
    expect(task!.blocks).toEqual([]);
  });

  it('returns null for invalid file', async () => {
    const result = await parseTaskFile(join(TMP, 'nope.json'));
    expect(result).toBeNull();
  });
});

describe('inferRole', () => {
  it('identifies lead', () => {
    expect(inferRole('TeamLead', 'team-lead')).toBe('lead');
  });

  it('identifies researcher', () => {
    expect(inferRole('Explorer', 'scout')).toBe('researcher');
    expect(inferRole('Architect', 'planner')).toBe('researcher');
  });

  it('identifies tester', () => {
    expect(inferRole('Validator', 'qa')).toBe('tester');
    expect(inferRole('default', 'tester')).toBe('tester');
  });

  it('identifies planner', () => {
    expect(inferRole('Designer', 'ui')).toBe('planner');
    expect(inferRole('default', 'artist')).toBe('planner');
  });

  it('defaults to implementer', () => {
    expect(inferRole('default', 'coder')).toBe('implementer');
  });
});

describe('teamMemberToAgent', () => {
  it('converts a team member to agent state', () => {
    const agent = teamMemberToAgent({
      name: 'team-lead',
      agentId: 'abc-123',
      agentType: 'TeamLead',
    });

    expect(agent).toEqual({
      id: 'abc-123',
      name: 'team-lead',
      role: 'lead',
      status: 'idle',
      tasksCompleted: 0,
    });
  });
});

describe('parseTranscriptLine', () => {
  it('detects a SendMessage tool call', () => {
    const line = JSON.stringify({
      type: 'assistant',
      agentName: 'coder',
      content: [{
        type: 'tool_use',
        id: 'tu1',
        name: 'SendMessage',
        input: {
          type: 'message',
          recipient: 'team-lead',
          content: 'Done with the task',
          summary: 'Task completed',
        },
      }],
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('message');
    expect(result!.message).toBeDefined();
    expect(result!.message!.from).toBe('coder');
    expect(result!.message!.to).toBe('team-lead');
  });

  it('detects a generic tool call', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'Read',
        input: { file_path: '/some/file.ts' },
      }],
    });

    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('tool_call');
    expect(result!.toolName).toBe('Reading file.ts');
  });

  it('detects tool_result', () => {
    const line = JSON.stringify({ type: 'tool_result', content: 'ok' });
    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('agent_activity');
  });

  it('returns null for non-JSON', () => {
    expect(parseTranscriptLine('not json')).toBeNull();
  });

  it('returns unknown for unrecognized types', () => {
    const line = JSON.stringify({ type: 'system', content: 'hello' });
    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('unknown');
  });
});

describe('cleanProjectName', () => {
  it('extracts project name after -Source-', () => {
    expect(cleanProjectName('-Users-Danny-Source-my-project')).toBe('my-project');
  });

  it('extracts project name after last -Source-', () => {
    expect(cleanProjectName('-Users-Danny-Source-nested-Source-deep-project')).toBe('deep-project');
  });

  it('falls back to last segment when no -Source-', () => {
    expect(cleanProjectName('-Users-Danny-my-app')).toBe('app');
  });

  it('handles single segment', () => {
    expect(cleanProjectName('project')).toBe('project');
  });

  it('handles empty string', () => {
    expect(cleanProjectName('')).toBe('');
  });
});

describe('parseSessionMetadata', () => {
  it('parses a solo session JSONL line', () => {
    const line = JSON.stringify({
      sessionId: 'sess-abc-123',
      slug: 'glistening-frost',
      cwd: '/Users/Danny/Source/my-project',
      gitBranch: 'main',
      version: '1.0.0',
      type: 'assistant',
    });

    const result = parseSessionMetadata(line);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess-abc-123');
    expect(result!.slug).toBe('glistening-frost');
    expect(result!.projectPath).toBe('/Users/Danny/Source/my-project');
    expect(result!.projectName).toBe('my-project');
    expect(result!.gitBranch).toBe('main');
    expect(result!.isTeam).toBe(false);
    expect(result!.teamName).toBeUndefined();
  });

  it('parses a team session JSONL line', () => {
    const line = JSON.stringify({
      sessionId: 'sess-team-456',
      slug: 'shimmering-glow',
      cwd: '/Users/Danny/Source/team-project',
      gitBranch: 'feature/x',
      version: '1.0.0',
      type: 'assistant',
      teamName: 'my-team-session',
    });

    const result = parseSessionMetadata(line);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess-team-456');
    expect(result!.isTeam).toBe(true);
    expect(result!.teamName).toBe('my-team-session');
  });

  it('returns null for missing sessionId', () => {
    const line = JSON.stringify({ slug: 'test', cwd: '/tmp', type: 'user' });
    expect(parseSessionMetadata(line)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseSessionMetadata('not json at all')).toBeNull();
  });

  it('derives projectName from cwd', () => {
    const line = JSON.stringify({
      sessionId: 'sess-1',
      cwd: '/home/user/projects/cool-app',
      type: 'user',
    });
    const result = parseSessionMetadata(line);
    expect(result!.projectName).toBe('cool-app');
  });
});

describe('readFirstLine', () => {
  it('reads the first line of a JSONL file', async () => {
    const filePath = join(TMP, 'test.jsonl');
    await writeFile(filePath, '{"sessionId":"s1","type":"user"}\n{"sessionId":"s1","type":"assistant"}\n');
    const line = await readFirstLine(filePath);
    expect(line).toBe('{"sessionId":"s1","type":"user"}');
  });

  it('returns null for empty file', async () => {
    const filePath = join(TMP, 'empty.jsonl');
    await writeFile(filePath, '');
    const line = await readFirstLine(filePath);
    expect(line).toBeNull();
  });

  it('returns null for missing file', async () => {
    const line = await readFirstLine(join(TMP, 'does-not-exist.jsonl'));
    expect(line).toBeNull();
  });
});

describe('extractRecordType', () => {
  it('extracts type from valid JSON', () => {
    expect(extractRecordType('{"type":"assistant","content":[]}')).toBe('assistant');
  });

  it('extracts user type', () => {
    expect(extractRecordType('{"type":"user","content":"hello"}')).toBe('user');
  });

  it('extracts tool_result type', () => {
    expect(extractRecordType('{"type":"tool_result"}')).toBe('tool_result');
  });

  it('returns null for invalid JSON', () => {
    expect(extractRecordType('not json')).toBeNull();
  });

  it('returns null when type is not a string', () => {
    expect(extractRecordType('{"type":42}')).toBeNull();
  });

  it('returns null when type is missing', () => {
    expect(extractRecordType('{"content":"hello"}')).toBeNull();
  });
});

describe('parseTeamConfig edge cases', () => {
  it('returns null when members is not an array', async () => {
    const configPath = join(TMP, 'bad-members.json');
    await writeFile(configPath, JSON.stringify({ members: 'not-array' }));
    const result = await parseTeamConfig(configPath);
    expect(result).toBeNull();
  });

  it('returns null for empty object', async () => {
    const configPath = join(TMP, 'empty-obj.json');
    await writeFile(configPath, JSON.stringify({}));
    const result = await parseTeamConfig(configPath);
    expect(result).toBeNull();
  });
});

describe('parseTaskFile edge cases', () => {
  it('returns null for empty file content', async () => {
    const taskPath = join(TMP, 'task-empty-content.json');
    await writeFile(taskPath, '   \n  ');
    const result = await parseTaskFile(taskPath);
    expect(result).toBeNull();
  });

  it('normalizes "deleted" status to "completed"', async () => {
    const taskPath = join(TMP, 'task-deleted.json');
    await writeFile(taskPath, JSON.stringify({
      id: '99',
      subject: 'Deleted task',
      status: 'deleted',
    }));
    const task = await parseTaskFile(taskPath);
    expect(task).not.toBeNull();
    expect(task!.status).toBe('completed');
  });

  it('normalizes unknown status to "pending"', async () => {
    const taskPath = join(TMP, 'task-unknown-status.json');
    await writeFile(taskPath, JSON.stringify({
      id: '100',
      subject: 'Unknown status',
      status: 'some_weird_status',
    }));
    const task = await parseTaskFile(taskPath);
    expect(task!.status).toBe('pending');
  });

  it('uses filename as fallback ID when id field is missing', async () => {
    const taskPath = join(TMP, 'task-55.json');
    await writeFile(taskPath, JSON.stringify({ subject: 'No ID' }));
    const task = await parseTaskFile(taskPath);
    expect(task!.id).toBe('task-55');
  });

  it('handles JSON array by using defaults (typeof array is "object")', async () => {
    const taskPath = join(TMP, 'task-array.json');
    await writeFile(taskPath, '[1, 2, 3]');
    const task = await parseTaskFile(taskPath);
    // Arrays pass the typeof check, so they get treated as objects with missing fields
    expect(task).not.toBeNull();
    expect(task!.subject).toBe('Untitled');
    expect(task!.status).toBe('pending');
  });
});

describe('parseTranscriptLine edge cases', () => {
  it('returns null for JSON array', () => {
    expect(parseTranscriptLine('[1,2,3]')).toBeNull();
  });

  it('returns null for null JSON', () => {
    expect(parseTranscriptLine('null')).toBeNull();
  });

  it('detects compact_boundary event', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'compact_boundary',
      compactMetadata: { preTokens: 167000 },
    });
    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('compact');
  });

  it('detects microcompact_boundary event', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'microcompact_boundary',
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('compact');
  });

  it('detects thinking block in assistant message', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: 'Let me think about this...' }],
      },
    });
    const result = parseTranscriptLine(line);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('thinking');
    expect(result!.toolName).toBe('Thinking...');
  });

  it('detects text block in assistant message as "Responding"', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Here is my response...' }],
      },
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('thinking');
    expect(result!.toolName).toBe('Responding...');
  });

  it('detects bash_progress as progress type', () => {
    const line = JSON.stringify({
      type: 'progress',
      data: { type: 'bash_progress', output: 'building...' },
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('progress');
    expect(result!.toolName).toBe('Running command...');
  });

  it('detects agent_progress as progress type', () => {
    const line = JSON.stringify({
      type: 'progress',
      data: { type: 'agent_progress' },
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('progress');
    expect(result!.toolName).toBe('Agent working...');
  });

  it('detects generic progress without specific type', () => {
    const line = JSON.stringify({
      type: 'progress',
      data: { type: 'hook_progress' },
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('progress');
    expect(result!.toolName).toBeUndefined();
  });

  it('detects tool_output as agent_activity', () => {
    const line = JSON.stringify({ type: 'tool_output', content: 'output' });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('agent_activity');
  });

  it('extracts agentName from agent_name field', () => {
    const line = JSON.stringify({
      type: 'assistant',
      agent_name: 'researcher',
      content: [{ type: 'tool_use', name: 'Read', id: 'tu1', input: { file_path: '/f.ts' } }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.agentName).toBe('researcher');
  });

  it('extracts agentName from metadata.agentName', () => {
    const line = JSON.stringify({
      type: 'assistant',
      metadata: { agentName: 'tester' },
      content: [{ type: 'tool_use', name: 'Bash', id: 'tu2', input: { command: 'npm test' } }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.agentName).toBe('tester');
  });

  it('extracts agentName from metadata.agent_name', () => {
    const line = JSON.stringify({
      type: 'assistant',
      metadata: { agent_name: 'planner' },
      content: [{ type: 'tool_use', name: 'Write', id: 'tu3', input: { file_path: '/x.ts' } }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.agentName).toBe('planner');
  });

  it('detects tool_use in top-level format (format 2)', () => {
    const line = JSON.stringify({
      type: 'tool_use',
      name: 'Edit',
      id: 'tu-top',
      input: { file_path: '/src/main.ts' },
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('tool_call');
    expect(result!.toolName).toBe('Editing main.ts');
  });

  it('detects tool_use in nested message wrapper (format 3)', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Grep', id: 'tu-nested', input: { pattern: 'import' } },
        ],
      },
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('tool_call');
    expect(result!.toolName).toBe('Searching: import');
  });

  it('marks AskUserQuestion as isUserPrompt', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{ type: 'tool_use', name: 'AskUserQuestion', id: 'tu4', input: {} }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.isUserPrompt).toBe(true);
  });

  it('marks EnterPlanMode as isUserPrompt', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{ type: 'tool_use', name: 'EnterPlanMode', id: 'tu5', input: {} }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.isUserPrompt).toBe(true);
  });

  it('marks ExitPlanMode as isUserPrompt', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{ type: 'tool_use', name: 'ExitPlanMode', id: 'tu6', input: {} }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.isUserPrompt).toBe(true);
  });

  it('does not mark regular tools as isUserPrompt', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{ type: 'tool_use', name: 'Read', id: 'tu7', input: { file_path: '/x.ts' } }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.isUserPrompt).toBe(false);
  });

  it('does not extract SendMessage without agentName', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        id: 'tu8',
        name: 'SendMessage',
        input: {
          type: 'message',
          recipient: 'lead',
          content: 'hello',
          summary: 'test',
        },
      }],
    });
    const result = parseTranscriptLine(line);
    // Without agentName, parseSendMessageInput returns null, falls through to tool_call
    expect(result!.type).toBe('tool_call');
  });

  it('handles SendMessage broadcast with recipient defaulting to "all"', () => {
    const line = JSON.stringify({
      type: 'assistant',
      agentName: 'lead',
      content: [{
        type: 'tool_use',
        id: 'tu9',
        name: 'SendMessage',
        input: {
          type: 'broadcast',
          content: 'Attention everyone',
          summary: 'Broadcast msg',
        },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.type).toBe('message');
    expect(result!.message!.to).toBe('all');
  });
});

describe('parseTranscriptLine describeToolAction (parser version)', () => {
  it('describes Bash with description', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'Bash',
        input: { command: 'npm test', description: 'Run unit tests' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Run unit tests');
  });

  it('describes Bash with command when no description', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'Bash',
        input: { command: 'git status && git diff' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Running: git status');
  });

  it('describes Bash with no input as "Running command"', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'Bash',
        input: {},
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Running command');
  });

  it('describes Glob with pattern', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'Glob',
        input: { pattern: '**/*.tsx' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Searching: **/*.tsx');
  });

  it('describes Task spawning', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'Task',
        input: { description: 'Research API patterns' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Spawning: Research API patterns');
  });

  it('describes TaskCreate with subject', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'TaskCreate',
        input: { subject: 'Add auth' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Creating task: Add auth');
  });

  it('describes TaskUpdate with status', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'TaskUpdate',
        input: { status: 'completed' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toContain('completed');
  });

  it('describes WebSearch with query', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'WebSearch',
        input: { query: 'react hooks tutorial' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Searching: react hooks tutorial');
  });

  it('describes WebFetch', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'WebFetch',
        input: { url: 'https://example.com' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('Fetching web page');
  });

  it('falls back to tool name for unknown tools', () => {
    const line = JSON.stringify({
      type: 'assistant',
      content: [{
        type: 'tool_use',
        name: 'CustomTool',
        input: { foo: 'bar' },
      }],
    });
    const result = parseTranscriptLine(line);
    expect(result!.toolName).toBe('CustomTool');
  });
});

describe('parseSessionMetadata edge cases', () => {
  it('derives projectName from slug when cwd is empty', () => {
    const line = JSON.stringify({
      sessionId: 'sess-1',
      slug: '-Users-Danny-Source-cool-project',
      cwd: '',
      type: 'user',
    });
    const result = parseSessionMetadata(line);
    expect(result!.projectName).toBe('cool-project');
  });

  it('returns null for JSON array input', () => {
    expect(parseSessionMetadata('[1,2,3]')).toBeNull();
  });

  it('handles cwd with no segments gracefully', () => {
    const line = JSON.stringify({
      sessionId: 'sess-1',
      cwd: '/',
      type: 'user',
    });
    const result = parseSessionMetadata(line);
    expect(result).not.toBeNull();
    // Root "/" splits to empty segments, projectName should fallback
    expect(result!.projectName).toBeDefined();
  });

  it('sets lastActivity to 0 (caller should override)', () => {
    const line = JSON.stringify({
      sessionId: 'sess-1',
      cwd: '/tmp',
      type: 'user',
    });
    const result = parseSessionMetadata(line);
    expect(result!.lastActivity).toBe(0);
  });
});

describe('inferRole edge cases', () => {
  it('identifies scribe as planner', () => {
    expect(inferRole('default', 'scribe')).toBe('planner');
  });

  it('identifies architect as researcher', () => {
    expect(inferRole('Architect', 'bob')).toBe('researcher');
  });

  it('identifies explore keyword as researcher', () => {
    expect(inferRole('', 'explorer-bot')).toBe('researcher');
  });

  it('identifies validat keyword as tester', () => {
    expect(inferRole('Validator', 'check')).toBe('tester');
  });

  it('returns implementer for generic names', () => {
    expect(inferRole('', 'bob')).toBe('implementer');
    expect(inferRole('Worker', 'agent-42')).toBe('implementer');
  });
});

describe('detectGitWorktree', () => {
  it('detects branch and no worktree for normal repo', async () => {
    const mockExec = async (cmd: string, args: string[]) => {
      if (args[0] === 'branch') return { stdout: 'main\n' };
      if (args[1] === '--git-dir') return { stdout: '.git\n' };
      if (args[1] === '--git-common-dir') return { stdout: '.git\n' };
      return { stdout: '' };
    };
    const result = await detectGitWorktree('/tmp/repo', mockExec as any);
    expect(result.gitBranch).toBe('main');
    expect(result.gitWorktree).toBeUndefined();
  });

  it('detects branch and worktree path for a worktree', async () => {
    const mockExec = async (cmd: string, args: string[]) => {
      if (args[0] === 'branch') return { stdout: 'feature/new\n' };
      if (args[1] === '--git-dir') return { stdout: '/main-repo/.git/worktrees/wt1\n' };
      if (args[1] === '--git-common-dir') return { stdout: '/main-repo/.git\n' };
      if (args[1] === '--show-toplevel') return { stdout: '/Users/dev/project-wt\n' };
      return { stdout: '' };
    };
    const result = await detectGitWorktree('/Users/dev/project-wt', mockExec as any);
    expect(result.gitBranch).toBe('feature/new');
    expect(result.gitWorktree).toBe('/Users/dev/project-wt');
  });

  it('returns empty object when git fails', async () => {
    const mockExec = async () => {
      throw new Error('git not found');
    };
    const result = await detectGitWorktree('/tmp/not-a-repo', mockExec as any);
    expect(result.gitBranch).toBeUndefined();
    expect(result.gitWorktree).toBeUndefined();
  });

  it('handles detached HEAD (empty branch output)', async () => {
    const mockExec = async (cmd: string, args: string[]) => {
      if (args[0] === 'branch') return { stdout: '\n' };
      if (args[1] === '--git-dir') return { stdout: '.git\n' };
      if (args[1] === '--git-common-dir') return { stdout: '.git\n' };
      return { stdout: '' };
    };
    const result = await detectGitWorktree('/tmp/repo', mockExec as any);
    expect(result.gitBranch).toBeUndefined();
    expect(result.gitWorktree).toBeUndefined();
  });

  it('does not set worktree when git-dir equals .git (normal repo)', async () => {
    const mockExec = async (cmd: string, args: string[]) => {
      if (args[0] === 'branch') return { stdout: 'develop\n' };
      if (args[1] === '--git-dir') return { stdout: '.git\n' };
      if (args[1] === '--git-common-dir') return { stdout: '/some/other/dir\n' };
      return { stdout: '' };
    };
    const result = await detectGitWorktree('/tmp/repo', mockExec as any);
    expect(result.gitBranch).toBe('develop');
    // git-dir is '.git', so even though common-dir differs, it's not a worktree
    expect(result.gitWorktree).toBeUndefined();
  });

  it('handles empty show-toplevel output gracefully', async () => {
    const mockExec = async (cmd: string, args: string[]) => {
      if (args[0] === 'branch') return { stdout: 'feature/x\n' };
      if (args[1] === '--git-dir') return { stdout: '/main/.git/worktrees/wt\n' };
      if (args[1] === '--git-common-dir') return { stdout: '/main/.git\n' };
      if (args[1] === '--show-toplevel') return { stdout: '\n' };
      return { stdout: '' };
    };
    const result = await detectGitWorktree('/tmp/wt', mockExec as any);
    expect(result.gitBranch).toBe('feature/x');
    expect(result.gitWorktree).toBeUndefined();
  });
});
