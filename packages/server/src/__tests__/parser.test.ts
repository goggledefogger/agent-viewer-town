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
    expect(result!.toolName).toBe('Read');
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
