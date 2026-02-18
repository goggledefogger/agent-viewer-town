import type { SessionInfo } from '@agent-viewer/shared';

/**
 * Converts a project directory slug like `-Users-Danny-Source-my-project`
 * into a human-readable name like `my-project`.
 */
export function cleanProjectName(slug: string): string {
  // Try to find the last segment after `-Source-`
  const sourceIdx = slug.lastIndexOf('-Source-');
  if (sourceIdx !== -1) {
    return slug.slice(sourceIdx + '-Source-'.length);
  }
  // Fallback: take the last hyphen-delimited segment that looks meaningful
  // (skip segments that look like path components: single uppercase letters, etc.)
  const parts = slug.split('-').filter(Boolean);
  if (parts.length > 0) {
    // Walk backwards to find the project name portion
    // Typical slug: -Users-Danny-Source-my-project or -Users-Danny-my-project
    // Take everything after the last single-word path segment (like a username)
    // Simple heuristic: return the last segment
    return parts[parts.length - 1];
  }
  return slug;
}

/**
 * Parse session metadata from a single JSONL line.
 * Every line in a Claude Code transcript has top-level fields:
 * sessionId, slug, cwd, gitBranch, version, type
 * Team sessions also have: teamName, agentId
 */
export function parseSessionMetadata(line: string): SessionInfo | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
  if (!sessionId) return null;

  const slug = typeof data.slug === 'string' ? data.slug : '';
  const cwd = typeof data.cwd === 'string' ? data.cwd : '';
  const gitBranch = typeof data.gitBranch === 'string' ? data.gitBranch : undefined;
  const teamName = typeof data.teamName === 'string' ? data.teamName : undefined;
  const agentId = typeof data.agentId === 'string' ? data.agentId : undefined;
  const isTeam = !!teamName;

  // Derive project name from the cwd or slug
  let projectName = '';
  if (cwd) {
    // Use the last directory segment of cwd
    const segments = cwd.split('/').filter(Boolean);
    projectName = segments[segments.length - 1] || '';
  }
  if (!projectName) {
    projectName = cleanProjectName(slug);
  }

  return {
    sessionId,
    slug,
    projectPath: cwd,
    projectName,
    gitBranch,
    isTeam,
    teamName,
    agentId,
    lastActivity: 0, // Caller should set from file mtime
  };
}

/**
 * Extract the JSONL record type field from a transcript line.
 * Returns the type string: "user", "assistant", "tool_result", etc.
 */
export function extractRecordType(line: string): string | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (data && typeof data.type === 'string') {
    return data.type;
  }
  return null;
}
