import type { AgentState, SessionInfo, SessionListEntry, GroupedSessionsList, ProjectGroup, BranchGroup } from '@agent-viewer/shared';

/**
 * Build a flat sessions list from session data.
 * Pure function — no side effects or state mutation.
 */
export function buildSessionsList(
  sessions: Map<string, SessionInfo>,
  getAgentsForSession: (session: SessionInfo) => AgentState[],
  activeSessionId: string | undefined,
): SessionListEntry[] {
  const entries: SessionListEntry[] = [];
  for (const session of sessions.values()) {
    const agents = getAgentsForSession(session);
    const hasWaiting = agents.some((a) => a.waitingForInput === true);
    const resolvedPath = session.mainRepoPath || session.projectPath;
    entries.push({
      sessionId: session.sessionId,
      projectName: session.projectName,
      projectPath: resolvedPath,
      slug: session.slug,
      gitBranch: session.gitBranch,
      isTeam: session.isTeam,
      agentCount: agents.length,
      lastActivity: session.lastActivity,
      active: activeSessionId === session.sessionId,
      hasWaitingAgent: hasWaiting,
    });
  }
  // Most recently active first
  entries.sort((a, b) => b.lastActivity - a.lastActivity);
  return entries;
}

/**
 * Build a hierarchical sessions list grouped by project and branch.
 * Pure function — no side effects or state mutation.
 *
 * Projects are sorted: active first, then waiting, then alphabetical.
 * Branches within a project: active first, then waiting, then alphabetical.
 * Sessions within a branch: active first, then waiting, then remaining.
 */
export function buildGroupedSessionsList(
  sessions: Map<string, SessionInfo>,
  getAgentsForSession: (session: SessionInfo) => AgentState[],
  activeSessionId: string | undefined,
): GroupedSessionsList {
  const flatSessions = buildSessionsList(sessions, getAgentsForSession, activeSessionId);

  // Group by project key
  const projectMap = new Map<string, { name: string; path: string; branches: Map<string, SessionListEntry[]> }>();

  for (const entry of flatSessions) {
    const session = sessions.get(entry.sessionId);
    let projectKey: string;
    let projectName: string;
    let projectPath: string;

    if (session && session.isTeam && !session.projectPath) {
      // Team sessions without projectPath group by team name
      const teamLabel = session.teamName || session.projectName;
      projectKey = `team:${teamLabel}`;
      projectName = teamLabel;
      projectPath = '';
    } else {
      projectKey = entry.projectPath || entry.projectName;
      projectName = session?.projectName || entry.projectName;
      projectPath = entry.projectPath;
    }

    if (!projectMap.has(projectKey)) {
      projectMap.set(projectKey, { name: projectName, path: projectPath, branches: new Map() });
    }

    const branchKey = entry.gitBranch || '(default)';
    const project = projectMap.get(projectKey)!;
    if (!project.branches.has(branchKey)) {
      project.branches.set(branchKey, []);
    }
    project.branches.get(branchKey)!.push(entry);
  }

  // Build ProjectGroup array
  const projects: ProjectGroup[] = [];

  for (const [projectKey, { name, path, branches }] of projectMap) {
    const branchGroups: BranchGroup[] = [];

    for (const [branchName, branchSessions] of branches) {
      // Sort sessions within branch: active first, then waiting, then remaining
      branchSessions.sort((a, b) => {
        const aActive = a.sessionId === activeSessionId ? 1 : 0;
        const bActive = b.sessionId === activeSessionId ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;

        const aWaiting = a.hasWaitingAgent ? 1 : 0;
        const bWaiting = b.hasWaitingAgent ? 1 : 0;
        if (aWaiting !== bWaiting) return bWaiting - aWaiting;

        // Most recently active first
        return b.lastActivity - a.lastActivity;
      });

      branchGroups.push({
        branch: branchName,
        isDefault: branchName === '(default)',
        sessions: branchSessions,
        totalAgents: branchSessions.reduce((sum, s) => sum + s.agentCount, 0),
        lastActivity: Math.max(...branchSessions.map((s) => s.lastActivity)),
        hasWaitingAgent: branchSessions.some((s) => s.hasWaitingAgent),
      });
    }

    // Sort branches: active branch first, then waiting, then most recent, then alphabetical
    // (default) branch sorts after named branches unless it's the active one
    branchGroups.sort((a, b) => {
      const aHasActive = a.sessions.some((s) => s.sessionId === activeSessionId);
      const bHasActive = b.sessions.some((s) => s.sessionId === activeSessionId);
      if (aHasActive !== bHasActive) return aHasActive ? -1 : 1;

      if (a.hasWaitingAgent !== b.hasWaitingAgent) return a.hasWaitingAgent ? -1 : 1;

      // (default) sorts last among non-active, non-waiting branches
      if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;

      // Most recently active first
      if (a.lastActivity !== b.lastActivity) return b.lastActivity - a.lastActivity;

      return a.branch.localeCompare(b.branch);
    });

    projects.push({
      projectKey,
      projectName: name,
      projectPath: path,
      branches: branchGroups,
      totalSessions: branchGroups.reduce((sum, b) => sum + b.sessions.length, 0),
      totalAgents: branchGroups.reduce((sum, b) => sum + b.totalAgents, 0),
      lastActivity: Math.max(...branchGroups.map((b) => b.lastActivity)),
      hasWaitingAgent: branchGroups.some((b) => b.hasWaitingAgent),
    });
  }

  // Sort projects: active first, then waiting, then most recent, then alphabetical
  projects.sort((a, b) => {
    const aHasActive = a.branches.some((br) => br.sessions.some((s) => s.sessionId === activeSessionId));
    const bHasActive = b.branches.some((br) => br.sessions.some((s) => s.sessionId === activeSessionId));
    if (aHasActive !== bHasActive) return aHasActive ? -1 : 1;

    if (a.hasWaitingAgent !== b.hasWaitingAgent) return a.hasWaitingAgent ? -1 : 1;

    // Most recently active first (ensures current project sorts above stale ones)
    if (a.lastActivity !== b.lastActivity) return b.lastActivity - a.lastActivity;

    return a.projectName.localeCompare(b.projectName);
  });

  return { projects, flatSessions };
}
