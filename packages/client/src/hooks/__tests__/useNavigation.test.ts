import { describe, it, expect } from 'vitest';
import type { GroupedSessionsList, ProjectGroup, BranchGroup, SessionListEntry } from '@agent-viewer/shared';

// Test the pure logic of useNavigation by extracting helpers
// We test the filtering and breadcrumb computation logic directly

function makeSession(overrides?: Partial<SessionListEntry>): SessionListEntry {
  return {
    sessionId: 'sess-1',
    projectName: 'test-project',
    projectPath: '/home/user/test-project',
    slug: 'glistening-frost',
    isTeam: false,
    agentCount: 1,
    lastActivity: Date.now(),
    active: false,
    hasWaitingAgent: false,
    ...overrides,
  };
}

function makeBranch(branch: string, sessions: SessionListEntry[], overrides?: Partial<BranchGroup>): BranchGroup {
  return {
    branch,
    isDefault: branch === '(default)',
    sessions,
    totalAgents: sessions.reduce((sum, s) => sum + s.agentCount, 0),
    lastActivity: Math.max(...sessions.map(s => s.lastActivity)),
    hasWaitingAgent: sessions.some(s => s.hasWaitingAgent),
    ...overrides,
  };
}

function makeProject(name: string, branches: BranchGroup[], overrides?: Partial<ProjectGroup>): ProjectGroup {
  return {
    projectKey: `/home/user/${name}`,
    projectName: name,
    projectPath: `/home/user/${name}`,
    branches,
    totalSessions: branches.reduce((sum, b) => sum + b.sessions.length, 0),
    totalAgents: branches.reduce((sum, b) => sum + b.totalAgents, 0),
    lastActivity: Math.max(...branches.map(b => b.lastActivity)),
    hasWaitingAgent: branches.some(b => b.hasWaitingAgent),
    ...overrides,
  };
}

// Pure functions extracted from useNavigation for testing
function filterProjects(
  projects: ProjectGroup[],
  searchFilter: string,
  hideIdle: boolean
): ProjectGroup[] {
  let result = projects;
  const filter = searchFilter.toLowerCase().trim();

  if (filter) {
    result = result
      .map((project) => {
        const projectMatches = project.projectName.toLowerCase().includes(filter);
        const matchingBranches = project.branches.filter(
          (b) =>
            b.branch.toLowerCase().includes(filter) ||
            b.sessions.some((s) => s.slug.toLowerCase().includes(filter))
        );
        if (projectMatches) return project;
        if (matchingBranches.length > 0) {
          return { ...project, branches: matchingBranches };
        }
        return null;
      })
      .filter((p): p is ProjectGroup => p !== null);
  }

  if (hideIdle) {
    const IDLE_THRESHOLD = 5 * 60 * 1000;
    const now = Date.now();
    result = result
      .map((project) => {
        const activeBranches = project.branches.filter((b) =>
          b.sessions.some((s) => now - s.lastActivity < IDLE_THRESHOLD)
        );
        if (activeBranches.length === 0) return null;
        return { ...project, branches: activeBranches };
      })
      .filter((p): p is ProjectGroup => p !== null);
  }

  return result;
}

interface BreadcrumbSegment {
  label: string;
  level: 0 | 1 | 2;
  projectKey?: string;
  branch?: string;
  isCurrent: boolean;
}

function computeBreadcrumbs(
  zoomLevel: 0 | 1 | 2,
  projectKey: string | undefined,
  currentProject: ProjectGroup | undefined,
  currentBranch: BranchGroup | undefined
): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [];

  if (zoomLevel === 0) {
    segments.push({ label: 'All Projects', level: 0, isCurrent: true });
  } else {
    segments.push({ label: 'All', level: 0, isCurrent: false });
  }

  if (zoomLevel >= 1 && currentProject) {
    segments.push({
      label: currentProject.projectName,
      level: 1,
      projectKey: currentProject.projectKey,
      isCurrent: zoomLevel === 1,
    });
  }

  if (zoomLevel >= 2 && currentBranch) {
    segments.push({
      label: currentBranch.branch,
      level: 2,
      projectKey,
      branch: currentBranch.branch,
      isCurrent: true,
    });
  }

  return segments;
}

function computeWaitingCount(projects: ProjectGroup[]): number {
  return projects.filter((p) => p.hasWaitingAgent).reduce((count, p) => {
    return count + p.branches.reduce((bc, b) => {
      return bc + b.sessions.filter((s) => s.hasWaitingAgent).length;
    }, 0);
  }, 0);
}

describe('Navigation filtering', () => {
  const now = Date.now();

  const activeSession = makeSession({
    sessionId: 'active-1',
    projectName: 'my-app',
    slug: 'glistening-frost',
    lastActivity: now,
  });

  const idleSession = makeSession({
    sessionId: 'idle-1',
    projectName: 'old-project',
    slug: 'wandering-dawn',
    lastActivity: now - 10 * 60 * 1000, // 10 min ago
  });

  const projects: ProjectGroup[] = [
    makeProject('my-app', [
      makeBranch('main', [activeSession]),
    ]),
    makeProject('old-project', [
      makeBranch('main', [idleSession]),
    ]),
  ];

  it('returns all projects when no filter is applied', () => {
    const result = filterProjects(projects, '', false);
    expect(result).toHaveLength(2);
  });

  it('filters projects by project name', () => {
    const result = filterProjects(projects, 'my-app', false);
    expect(result).toHaveLength(1);
    expect(result[0].projectName).toBe('my-app');
  });

  it('filters projects by branch name', () => {
    const branchProject = makeProject('project-x', [
      makeBranch('feature/navigation', [makeSession({ lastActivity: now })]),
      makeBranch('main', [makeSession({ sessionId: 's2', lastActivity: now })]),
    ]);

    const result = filterProjects([branchProject], 'navigation', false);
    expect(result).toHaveLength(1);
    expect(result[0].branches).toHaveLength(1);
    expect(result[0].branches[0].branch).toBe('feature/navigation');
  });

  it('filters projects by session slug', () => {
    const result = filterProjects(projects, 'glistening', false);
    expect(result).toHaveLength(1);
    expect(result[0].projectName).toBe('my-app');
  });

  it('returns empty when search matches nothing', () => {
    const result = filterProjects(projects, 'nonexistent-xyz', false);
    expect(result).toHaveLength(0);
  });

  it('search is case-insensitive', () => {
    const result = filterProjects(projects, 'MY-APP', false);
    expect(result).toHaveLength(1);
    expect(result[0].projectName).toBe('my-app');
  });

  it('hideIdle removes projects with all idle sessions', () => {
    const result = filterProjects(projects, '', true);
    expect(result).toHaveLength(1);
    expect(result[0].projectName).toBe('my-app');
  });

  it('hideIdle keeps projects with at least one active session', () => {
    const mixedProject = makeProject('mixed', [
      makeBranch('active-branch', [makeSession({ lastActivity: now })]),
      makeBranch('idle-branch', [makeSession({
        sessionId: 's-idle',
        lastActivity: now - 10 * 60 * 1000,
      })]),
    ]);

    const result = filterProjects([mixedProject], '', true);
    expect(result).toHaveLength(1);
    expect(result[0].branches).toHaveLength(1);
    expect(result[0].branches[0].branch).toBe('active-branch');
  });

  it('combines search and hideIdle filters', () => {
    const result = filterProjects(projects, 'old', true);
    // old-project matches search but is idle, so filtered out
    expect(result).toHaveLength(0);
  });
});

describe('Breadcrumb computation', () => {
  const project = makeProject('my-app', [
    makeBranch('main', [makeSession()]),
    makeBranch('feature/nav', [makeSession({ sessionId: 's2' })]),
  ]);
  const branch = project.branches[0]; // main

  it('Level 0: shows single "All Projects" segment', () => {
    const crumbs = computeBreadcrumbs(0, undefined, undefined, undefined);
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].label).toBe('All Projects');
    expect(crumbs[0].isCurrent).toBe(true);
  });

  it('Level 1: shows "All" link + project name as current', () => {
    const crumbs = computeBreadcrumbs(1, project.projectKey, project, undefined);
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0].label).toBe('All');
    expect(crumbs[0].isCurrent).toBe(false);
    expect(crumbs[1].label).toBe('my-app');
    expect(crumbs[1].isCurrent).toBe(true);
  });

  it('Level 2: shows "All" link + project link + branch as current', () => {
    const crumbs = computeBreadcrumbs(2, project.projectKey, project, branch);
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0].label).toBe('All');
    expect(crumbs[0].isCurrent).toBe(false);
    expect(crumbs[1].label).toBe('my-app');
    expect(crumbs[1].isCurrent).toBe(false);
    expect(crumbs[2].label).toBe('main');
    expect(crumbs[2].isCurrent).toBe(true);
  });

  it('Level 2 breadcrumbs include project key for navigation', () => {
    const crumbs = computeBreadcrumbs(2, project.projectKey, project, branch);
    expect(crumbs[1].projectKey).toBe(project.projectKey);
    expect(crumbs[2].branch).toBe('main');
  });
});

describe('Waiting count computation', () => {
  it('returns 0 when no sessions have waiting agents', () => {
    const projects = [
      makeProject('proj', [
        makeBranch('main', [makeSession()]),
      ]),
    ];
    expect(computeWaitingCount(projects)).toBe(0);
  });

  it('counts sessions with waiting agents across projects', () => {
    const projects = [
      makeProject('proj-a', [
        makeBranch('main', [
          makeSession({ hasWaitingAgent: true }),
          makeSession({ sessionId: 's2', hasWaitingAgent: false }),
        ]),
      ]),
      makeProject('proj-b', [
        makeBranch('main', [
          makeSession({ sessionId: 's3', hasWaitingAgent: true }),
        ]),
      ]),
    ];
    expect(computeWaitingCount(projects)).toBe(2);
  });

  it('does not double-count from branch/project hasWaitingAgent flags', () => {
    const sessions = [
      makeSession({ hasWaitingAgent: true }),
    ];
    const projects = [
      makeProject('proj', [
        makeBranch('main', sessions, { hasWaitingAgent: true }),
      ], { hasWaitingAgent: true }),
    ];
    // Should count the session, not the branch or project flag
    expect(computeWaitingCount(projects)).toBe(1);
  });

  it('ignores projects without hasWaitingAgent even if they have sessions', () => {
    const projects = [
      makeProject('proj-no-waiting', [
        makeBranch('main', [
          makeSession({ hasWaitingAgent: false }),
          makeSession({ sessionId: 's2', hasWaitingAgent: false }),
        ]),
      ], { hasWaitingAgent: false }),
      makeProject('proj-with-waiting', [
        makeBranch('main', [
          makeSession({ sessionId: 's3', hasWaitingAgent: true }),
        ]),
      ]),
    ];
    expect(computeWaitingCount(projects)).toBe(1);
  });

  it('counts multiple waiting sessions across branches in the same project', () => {
    const projects = [
      makeProject('proj', [
        makeBranch('main', [
          makeSession({ sessionId: 's1', hasWaitingAgent: true }),
        ]),
        makeBranch('feature', [
          makeSession({ sessionId: 's2', hasWaitingAgent: true }),
          makeSession({ sessionId: 's3', hasWaitingAgent: false }),
        ]),
      ]),
    ];
    expect(computeWaitingCount(projects)).toBe(2);
  });
});

describe('Navigation filtering - edge cases', () => {
  const now = Date.now();

  it('trims whitespace from search filter', () => {
    const projects = [
      makeProject('my-app', [
        makeBranch('main', [makeSession({ lastActivity: now })]),
      ]),
    ];
    const result = filterProjects(projects, '  my-app  ', false);
    expect(result).toHaveLength(1);
    expect(result[0].projectName).toBe('my-app');
  });

  it('hideIdle boundary: exactly 5 minutes ago is idle', () => {
    const exactlyFiveMin = makeSession({
      sessionId: 'boundary',
      lastActivity: now - 5 * 60 * 1000,
    });
    const projects = [
      makeProject('boundary-project', [
        makeBranch('main', [exactlyFiveMin]),
      ]),
    ];
    // 5 minutes ago: now - lastActivity === IDLE_THRESHOLD, NOT < IDLE_THRESHOLD
    const result = filterProjects(projects, '', true);
    expect(result).toHaveLength(0);
  });

  it('hideIdle boundary: well under 5 minutes ago is active', () => {
    const recentSession = makeSession({
      sessionId: 'active-boundary',
      lastActivity: Date.now() - 4 * 60 * 1000, // 4 minutes ago, well within threshold
    });
    const projects = [
      makeProject('active-project', [
        makeBranch('main', [recentSession]),
      ]),
    ];
    const result = filterProjects(projects, '', true);
    expect(result).toHaveLength(1);
  });

  it('search matches session slug even when branch does not match', () => {
    const projects = [
      makeProject('proj', [
        makeBranch('main', [
          makeSession({ slug: 'glistening-frost', lastActivity: now }),
          makeSession({ sessionId: 's2', slug: 'wandering-dawn', lastActivity: now }),
        ]),
      ]),
    ];
    const result = filterProjects(projects, 'wandering', false);
    expect(result).toHaveLength(1);
    // The entire branch is included since one session matched
    expect(result[0].branches[0].sessions).toHaveLength(2);
  });

  it('empty search string returns all projects', () => {
    const projects = [
      makeProject('a', [makeBranch('main', [makeSession({ lastActivity: now })])]),
      makeProject('b', [makeBranch('main', [makeSession({ sessionId: 's2', lastActivity: now })])]),
    ];
    const result = filterProjects(projects, '', false);
    expect(result).toHaveLength(2);
  });

  it('project name match returns all branches even if branches do not match', () => {
    const projects = [
      makeProject('my-app', [
        makeBranch('main', [makeSession({ lastActivity: now })]),
        makeBranch('feature/unrelated', [makeSession({ sessionId: 's2', lastActivity: now })]),
      ]),
    ];
    // 'my-app' matches project name so all branches should be included
    const result = filterProjects(projects, 'my-app', false);
    expect(result).toHaveLength(1);
    expect(result[0].branches).toHaveLength(2);
  });
});

describe('Breadcrumb edge cases', () => {
  it('Level 1 with undefined project returns only "All" segment', () => {
    const crumbs = computeBreadcrumbs(1, 'nonexistent-key', undefined, undefined);
    // currentProject is undefined, so only the "All" segment is added
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].label).toBe('All');
    expect(crumbs[0].isCurrent).toBe(false);
  });

  it('Level 2 with undefined branch returns "All" + project segments only', () => {
    const project = makeProject('my-app', [
      makeBranch('main', [makeSession()]),
    ]);
    const crumbs = computeBreadcrumbs(2, project.projectKey, project, undefined);
    // currentBranch is undefined, so branch segment is skipped
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0].label).toBe('All');
    expect(crumbs[1].label).toBe('my-app');
    // At level 2, project is NOT current (branch should be), but branch is missing
    expect(crumbs[1].isCurrent).toBe(false);
  });
});
