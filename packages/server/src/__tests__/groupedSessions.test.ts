import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../state';
import type { SessionInfo, AgentState } from '@agent-viewer/shared';

function makeSession(id: string, projectName: string, overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    sessionId: id,
    slug: `slug-${id}`,
    projectPath: `/home/user/${projectName}`,
    projectName,
    isTeam: false,
    lastActivity: Date.now(),
    ...overrides,
  };
}

function makeAgent(id: string, name: string, overrides?: Partial<AgentState>): AgentState {
  return {
    id,
    name,
    role: 'implementer',
    status: 'idle',
    tasksCompleted: 0,
    ...overrides,
  };
}

describe('getGroupedSessionsList', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = new StateManager();
    sm.subscribe(() => {}); // prevent "no listeners" warnings
  });

  it('returns empty projects and flatSessions when no sessions exist', () => {
    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toEqual([]);
    expect(grouped.flatSessions).toEqual([]);
  });

  it('groups a single session into one project with one branch', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.addSession(makeSession('s1', 'my-project', {
      lastActivity: 1000,
      gitBranch: 'main',
      mainRepoPath: '/home/user/my-project',
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toHaveLength(1);
    expect(grouped.projects[0].projectName).toBe('my-project');
    expect(grouped.projects[0].branches).toHaveLength(1);
    expect(grouped.projects[0].branches[0].branch).toBe('main');
    expect(grouped.projects[0].branches[0].sessions).toHaveLength(1);
    expect(grouped.projects[0].totalSessions).toBe(1);
    expect(grouped.projects[0].totalAgents).toBe(1);
  });

  it('groups sessions from same project but different branches', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    sm.addSession(makeSession('s1', 'my-project', {
      lastActivity: 1000,
      gitBranch: 'main',
      mainRepoPath: '/home/user/my-project',
    }));
    sm.addSession(makeSession('s2', 'my-project', {
      lastActivity: 2000,
      gitBranch: 'feature/nav',
      mainRepoPath: '/home/user/my-project',
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toHaveLength(1);
    expect(grouped.projects[0].branches).toHaveLength(2);
    expect(grouped.projects[0].totalSessions).toBe(2);
    expect(grouped.projects[0].totalAgents).toBe(2);
  });

  it('groups worktree sessions with the same mainRepoPath into one project', () => {
    sm.registerAgent(makeAgent('s1', 'agent-main'));
    sm.registerAgent(makeAgent('s2', 'agent-worktree'));

    // Main repo session
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      gitBranch: 'main',
      projectPath: '/home/user/project',
      mainRepoPath: '/home/user/project',
    }));
    // Worktree session (different projectPath, same mainRepoPath)
    sm.addSession(makeSession('s2', 'project-researcher', {
      lastActivity: 2000,
      gitBranch: 'researcher/data',
      projectPath: '/home/user/project-researcher',
      mainRepoPath: '/home/user/project',
    }));

    const grouped = sm.getGroupedSessionsList();
    // Both should be grouped under one project since mainRepoPath matches
    expect(grouped.projects).toHaveLength(1);
    expect(grouped.projects[0].branches).toHaveLength(2);
  });

  it('separates sessions from different projects', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    sm.addSession(makeSession('s1', 'project-a', {
      lastActivity: 1000,
      gitBranch: 'main',
    }));
    sm.addSession(makeSession('s2', 'project-b', {
      lastActivity: 2000,
      gitBranch: 'main',
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toHaveLength(2);
    expect(grouped.projects.map(p => p.projectName).sort()).toEqual(['project-a', 'project-b']);
  });

  it('uses "(default)" branch for sessions without gitBranch', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.addSession(makeSession('s1', 'my-project', {
      lastActivity: 1000,
      // no gitBranch
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toHaveLength(1);
    expect(grouped.projects[0].branches[0].branch).toBe('(default)');
    expect(grouped.projects[0].branches[0].isDefault).toBe(true);
  });

  it('sorts projects with active session first', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    sm.addSession(makeSession('s1', 'aaa-first-alphabetically', {
      lastActivity: 1000,
      gitBranch: 'main',
    }));
    sm.addSession(makeSession('s2', 'zzz-last-alphabetically', {
      lastActivity: 3000, // most recent, auto-selected
      gitBranch: 'main',
    }));

    const grouped = sm.getGroupedSessionsList();
    // s2 is auto-selected (most recent), so its project should be first
    expect(grouped.projects[0].projectName).toBe('zzz-last-alphabetically');
    expect(grouped.projects[1].projectName).toBe('aaa-first-alphabetically');
  });

  it('sorts projects with waiting agents before non-waiting', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working', waitingForInput: true }));
    sm.registerAgent(makeAgent('s2', 'agent-b', { status: 'idle' }));
    sm.registerAgent(makeAgent('s3', 'agent-c', { status: 'idle' }));

    sm.addSession(makeSession('s1', 'has-waiting', {
      lastActivity: 1000,
      gitBranch: 'main',
    }));
    sm.addSession(makeSession('s2', 'no-waiting', {
      lastActivity: 2000,
      gitBranch: 'main',
    }));
    sm.addSession(makeSession('s3', 'active-project', {
      lastActivity: 3000, // auto-selected
      gitBranch: 'main',
    }));

    const grouped = sm.getGroupedSessionsList();
    // Active project first, then waiting, then alphabetical
    expect(grouped.projects[0].projectName).toBe('active-project');
    expect(grouped.projects[1].projectName).toBe('has-waiting');
    expect(grouped.projects[1].hasWaitingAgent).toBe(true);
  });

  it('sorts branches with active branch first, then waiting, then alphabetical', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working', waitingForInput: true }));
    sm.registerAgent(makeAgent('s2', 'agent-b'));
    sm.registerAgent(makeAgent('s3', 'agent-c'));

    const repoPath = '/home/user/project';
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      gitBranch: 'aaa-branch',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s2', 'project', {
      lastActivity: 2000,
      gitBranch: 'zzz-branch',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s3', 'project', {
      lastActivity: 3000, // auto-selected
      gitBranch: 'mmm-branch',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));

    const grouped = sm.getGroupedSessionsList();
    const branches = grouped.projects[0].branches.map(b => b.branch);
    // mmm-branch first (active), aaa-branch second (has waiting agent), zzz-branch last
    expect(branches[0]).toBe('mmm-branch');
    expect(branches[1]).toBe('aaa-branch');
    expect(branches[2]).toBe('zzz-branch');
  });

  it('sorts sessions within branch: active first, waiting next', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working', waitingForInput: true }));
    sm.registerAgent(makeAgent('s2', 'agent-b'));
    sm.registerAgent(makeAgent('s3', 'agent-c'));

    const repoPath = '/home/user/project';
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s2', 'project', {
      lastActivity: 2000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s3', 'project', {
      lastActivity: 3000, // auto-selected
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));

    const grouped = sm.getGroupedSessionsList();
    const branch = grouped.projects[0].branches[0];
    expect(branch.sessions[0].sessionId).toBe('s3'); // active
    expect(branch.sessions[1].sessionId).toBe('s1'); // waiting
    expect(branch.sessions[2].sessionId).toBe('s2'); // neither
  });

  it('(default) branch sorts after named branches', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    const repoPath = '/home/user/project';
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 2000, // auto-selected
      // no gitBranch -> (default)
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s2', 'project', {
      lastActivity: 1000,
      gitBranch: 'feature/test',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));

    const grouped = sm.getGroupedSessionsList();
    const branches = grouped.projects[0].branches.map(b => b.branch);
    // Active (default) should still come first since it's the active session's branch
    expect(branches[0]).toBe('(default)');
    expect(branches[1]).toBe('feature/test');
  });

  it('bubbles hasWaitingAgent from session to branch to project', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working', waitingForInput: true }));
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      gitBranch: 'feature/x',
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects[0].hasWaitingAgent).toBe(true);
    expect(grouped.projects[0].branches[0].hasWaitingAgent).toBe(true);
    expect(grouped.projects[0].branches[0].sessions[0].hasWaitingAgent).toBe(true);
  });

  it('hasWaitingAgent is false when no agents are waiting', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      gitBranch: 'main',
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects[0].hasWaitingAgent).toBe(false);
    expect(grouped.projects[0].branches[0].hasWaitingAgent).toBe(false);
  });

  it('aggregates totalAgents across branches', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));
    sm.registerAgent(makeAgent('s3', 'agent-c'));

    const repoPath = '/home/user/project';
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s2', 'project', {
      lastActivity: 2000,
      gitBranch: 'feature/a',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s3', 'project', {
      lastActivity: 3000,
      gitBranch: 'feature/b',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects[0].totalSessions).toBe(3);
    expect(grouped.projects[0].totalAgents).toBe(3);
  });

  it('team sessions without projectPath get grouped by team name', () => {
    sm.registerAgent(makeAgent('team-lead', 'lead', { role: 'lead' }));
    sm.addSession(makeSession('team-1', 'my-team', {
      lastActivity: 1000,
      isTeam: true,
      teamName: 'alpha-team',
      projectPath: '',
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toHaveLength(1);
    expect(grouped.projects[0].projectKey).toBe('team:alpha-team');
    expect(grouped.projects[0].projectName).toBe('alpha-team');
    expect(grouped.projects[0].projectPath).toBe('');
  });

  it('flatSessions matches the total sessions across all projects', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));
    sm.registerAgent(makeAgent('s3', 'agent-c'));

    sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
    sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));
    sm.addSession(makeSession('s3', 'project-a', { lastActivity: 3000, gitBranch: 'feature' }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.flatSessions).toHaveLength(3);
    // Total should equal sum of all branches' sessions
    const totalFromProjects = grouped.projects.reduce((sum, p) => sum + p.totalSessions, 0);
    expect(totalFromProjects).toBe(3);
  });

  it('accepts activeSessionId parameter for consistent sorting', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
    sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));

    // By default s2 is active, so project-b first
    const grouped1 = sm.getGroupedSessionsList();
    expect(grouped1.projects[0].projectName).toBe('project-b');

    // Override active to s1
    const grouped2 = sm.getGroupedSessionsList('s1');
    expect(grouped2.projects[0].projectName).toBe('project-a');
  });

  it('broadcasts sessions_grouped alongside sessions_list', () => {
    const messages: Array<{ type: string }> = [];
    sm.subscribe((msg) => messages.push(msg));

    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.addSession(makeSession('s1', 'project', { lastActivity: 1000 }));

    const groupedMsgs = messages.filter(m => m.type === 'sessions_grouped');
    const listMsgs = messages.filter(m => m.type === 'sessions_list');
    expect(groupedMsgs.length).toBeGreaterThan(0);
    expect(listMsgs.length).toBeGreaterThan(0);
  });

  it('lastActivity is the max across all sessions in a branch', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    const repoPath = '/home/user/project';
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s2', 'project', {
      lastActivity: 5000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects[0].branches[0].lastActivity).toBe(5000);
    expect(grouped.projects[0].lastActivity).toBe(5000);
  });

  it('handles mixed team and solo sessions in the same project', () => {
    sm.registerAgent(makeAgent('s1', 'agent-solo'));
    sm.registerAgent(makeAgent('team-lead', 'lead', { role: 'lead' }));

    sm.addSession(makeSession('s1', 'my-project', {
      lastActivity: 1000,
      gitBranch: 'main',
    }));
    sm.addSession(makeSession('team-1', 'my-project', {
      lastActivity: 2000,
      isTeam: true,
      teamName: 'my-team',
      gitBranch: 'feature/team-work',
    }));

    const grouped = sm.getGroupedSessionsList();
    // Since team session has projectPath, both group under the same project
    expect(grouped.projects.length).toBeGreaterThanOrEqual(1);
    expect(grouped.flatSessions).toHaveLength(2);
  });

  // === Additional regression tests ===

  it('counts multiple agents per team session in totalAgents', () => {
    sm.registerAgent(makeAgent('team-lead', 'lead', { role: 'lead' }));
    sm.registerAgent(makeAgent('team-worker-1', 'worker-1', { role: 'implementer' }));
    sm.registerAgent(makeAgent('team-worker-2', 'worker-2', { role: 'implementer' }));

    sm.addSession(makeSession('team-1', 'my-project', {
      lastActivity: 1000,
      gitBranch: 'main',
      isTeam: true,
      teamName: 'alpha',
    }));

    const grouped = sm.getGroupedSessionsList();
    // Team session should count all its agents
    expect(grouped.projects[0].totalAgents).toBe(3);
    expect(grouped.projects[0].branches[0].totalAgents).toBe(3);
  });

  it('does not cross-group same branch name in different projects', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    sm.addSession(makeSession('s1', 'project-a', {
      lastActivity: 1000,
      gitBranch: 'main',
      projectPath: '/home/user/project-a',
    }));
    sm.addSession(makeSession('s2', 'project-b', {
      lastActivity: 2000,
      gitBranch: 'main',
      projectPath: '/home/user/project-b',
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toHaveLength(2);
    // Each project should have exactly one branch named 'main'
    for (const project of grouped.projects) {
      expect(project.branches).toHaveLength(1);
      expect(project.branches[0].branch).toBe('main');
      expect(project.branches[0].sessions).toHaveLength(1);
    }
  });

  it('team session with projectPath groups under project, not team: prefix', () => {
    sm.registerAgent(makeAgent('team-lead', 'lead', { role: 'lead' }));
    sm.registerAgent(makeAgent('s1', 'agent-solo'));

    sm.addSession(makeSession('team-1', 'my-project', {
      lastActivity: 2000,
      isTeam: true,
      teamName: 'alpha',
      projectPath: '/home/user/my-project',
      gitBranch: 'feature/team',
    }));
    sm.addSession(makeSession('s1', 'my-project', {
      lastActivity: 1000,
      projectPath: '/home/user/my-project',
      gitBranch: 'main',
    }));

    const grouped = sm.getGroupedSessionsList();
    // Both should be in the same project (keyed by projectPath)
    expect(grouped.projects).toHaveLength(1);
    expect(grouped.projects[0].projectKey).toBe('/home/user/my-project');
    expect(grouped.projects[0].branches).toHaveLength(2);
    expect(grouped.projects[0].totalSessions).toBe(2);
  });

  it('worktree without gitBranch uses (default) branch', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));
    sm.registerAgent(makeAgent('s2', 'agent-b'));

    const repoPath = '/home/user/project';
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 1000,
      projectPath: repoPath,
      mainRepoPath: repoPath,
      gitBranch: 'main',
    }));
    sm.addSession(makeSession('s2', 'project-worktree', {
      lastActivity: 2000,
      projectPath: '/home/user/project-worktree',
      mainRepoPath: repoPath,
      // no gitBranch
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects).toHaveLength(1);
    const branches = grouped.projects[0].branches.map(b => b.branch);
    expect(branches).toContain('main');
    expect(branches).toContain('(default)');
  });

  it('sorts working (non-waiting) agents after waiting agents in session sort', () => {
    sm.registerAgent(makeAgent('s1', 'agent-working', { status: 'working' }));
    sm.registerAgent(makeAgent('s2', 'agent-waiting', { status: 'working', waitingForInput: true }));
    sm.registerAgent(makeAgent('s3', 'agent-idle', { status: 'idle' }));

    const repoPath = '/home/user/project';
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 3000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s2', 'project', {
      lastActivity: 1000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s3', 'project', {
      lastActivity: 2000,
      gitBranch: 'main',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));

    const grouped = sm.getGroupedSessionsList();
    const sessions = grouped.projects[0].branches[0].sessions;
    // s1 is auto-selected (most recent activity), so it's active -> first
    // s2 has waiting agent -> second
    // s3 is neither -> last
    expect(sessions[0].sessionId).toBe('s1');
    expect(sessions[1].sessionId).toBe('s2');
    expect(sessions[2].sessionId).toBe('s3');
  });

  it('alphabetical sort as tiebreaker for projects without active or waiting', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
    sm.registerAgent(makeAgent('s2', 'agent-b', { status: 'idle' }));
    sm.registerAgent(makeAgent('s3', 'agent-c', { status: 'idle' }));

    // s3 will be auto-selected (most recent)
    sm.addSession(makeSession('s1', 'gamma-project', { lastActivity: 1000, gitBranch: 'main' }));
    sm.addSession(makeSession('s2', 'alpha-project', { lastActivity: 2000, gitBranch: 'main' }));
    sm.addSession(makeSession('s3', 'beta-project', { lastActivity: 3000, gitBranch: 'main' }));

    const grouped = sm.getGroupedSessionsList();
    // beta-project first (active), then alpha-project, then gamma-project (alphabetical)
    expect(grouped.projects[0].projectName).toBe('beta-project');
    expect(grouped.projects[1].projectName).toBe('alpha-project');
    expect(grouped.projects[2].projectName).toBe('gamma-project');
  });

  it('getSessionsList uses mainRepoPath as projectPath for worktrees', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a'));

    sm.addSession(makeSession('s1', 'project-worktree', {
      lastActivity: 1000,
      projectPath: '/home/user/project-worktree',
      mainRepoPath: '/home/user/project',
      gitBranch: 'feature/x',
    }));

    const grouped = sm.getGroupedSessionsList();
    // projectPath in the flat entry should be mainRepoPath
    expect(grouped.flatSessions[0].projectPath).toBe('/home/user/project');
    // And the project groups by mainRepoPath
    expect(grouped.projects[0].projectKey).toBe('/home/user/project');
  });

  it('sorts projects by most recent activity before alphabetical', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
    sm.registerAgent(makeAgent('s2', 'agent-b', { status: 'idle' }));
    sm.registerAgent(makeAgent('s3', 'agent-c', { status: 'idle' }));

    // s3 will be auto-selected (most recent), but among s1 and s2,
    // s1 has more recent activity despite being alphabetically last
    sm.addSession(makeSession('s1', 'zzz-project', { lastActivity: 2000, gitBranch: 'main' }));
    sm.addSession(makeSession('s2', 'aaa-project', { lastActivity: 1000, gitBranch: 'main' }));
    sm.addSession(makeSession('s3', 'mmm-project', { lastActivity: 3000, gitBranch: 'main' }));

    const grouped = sm.getGroupedSessionsList();
    // mmm-project first (active), then zzz-project (more recent), then aaa-project
    expect(grouped.projects[0].projectName).toBe('mmm-project');
    expect(grouped.projects[1].projectName).toBe('zzz-project');
    expect(grouped.projects[2].projectName).toBe('aaa-project');
  });

  it('sorts branches by most recent activity before alphabetical', () => {
    sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
    sm.registerAgent(makeAgent('s2', 'agent-b', { status: 'idle' }));
    sm.registerAgent(makeAgent('s3', 'agent-c', { status: 'idle' }));

    const repoPath = '/home/user/project';
    // s3 auto-selected (most recent)
    sm.addSession(makeSession('s1', 'project', {
      lastActivity: 2000,
      gitBranch: 'zzz-branch',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s2', 'project', {
      lastActivity: 1000,
      gitBranch: 'aaa-branch',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));
    sm.addSession(makeSession('s3', 'project', {
      lastActivity: 3000,
      gitBranch: 'mmm-branch',
      projectPath: repoPath,
      mainRepoPath: repoPath,
    }));

    const grouped = sm.getGroupedSessionsList();
    const branches = grouped.projects[0].branches.map(b => b.branch);
    // mmm-branch first (active), then zzz-branch (more recent), then aaa-branch
    expect(branches[0]).toBe('mmm-branch');
    expect(branches[1]).toBe('zzz-branch');
    expect(branches[2]).toBe('aaa-branch');
  });

  it('team sessions without teamName fall back to projectName', () => {
    sm.registerAgent(makeAgent('team-lead', 'lead', { role: 'lead' }));

    sm.addSession(makeSession('team-1', 'my-team-project', {
      lastActivity: 1000,
      isTeam: true,
      projectPath: '',
      // no teamName set
    }));

    const grouped = sm.getGroupedSessionsList();
    expect(grouped.projects[0].projectKey).toBe('team:my-team-project');
    expect(grouped.projects[0].projectName).toBe('my-team-project');
  });
});
