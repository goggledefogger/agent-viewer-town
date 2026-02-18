import { readFile } from 'fs/promises';
import type { AgentState, AgentRole, TaskState } from '@agent-viewer/shared';

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

interface FileError extends Error {
  code: string;
}

function isFileError(err: unknown): err is FileError {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
