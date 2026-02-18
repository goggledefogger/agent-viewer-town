export interface GitStatus {
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  isDirty: boolean;
}

/**
 * Detect if a directory is inside a git worktree.
 * Returns { gitBranch, gitWorktree } if it is, or null values if not.
 */
export async function detectGitWorktree(
  cwd: string,
  execFileAsync: (cmd: string, args: string[], opts: { cwd: string; timeout: number }) => Promise<{ stdout: string }>
): Promise<{ gitBranch?: string; gitWorktree?: string }> {
  try {
    // Get the current branch
    const { stdout: branchOut } = await execFileAsync('git', ['branch', '--show-current'], {
      cwd, timeout: 3000,
    });
    const gitBranch = branchOut.trim() || undefined;

    // Check if this is a worktree (git rev-parse --git-common-dir differs from --git-dir)
    const [{ stdout: gitDirOut }, { stdout: commonDirOut }] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--git-dir'], { cwd, timeout: 3000 }),
      execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd, timeout: 3000 }),
    ]);
    const gitDir = gitDirOut.trim();
    const commonDir = commonDirOut.trim();

    // If git-dir !== git-common-dir, this is a worktree
    let gitWorktree: string | undefined;
    if (gitDir !== commonDir && gitDir !== '.git') {
      // The cwd itself is the worktree root (or a subdirectory of it)
      const { stdout: toplevelOut } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd, timeout: 3000,
      });
      gitWorktree = toplevelOut.trim() || undefined;
    }

    return { gitBranch, gitWorktree };
  } catch {
    return {};
  }
}

/** Cache git status results for 30 seconds per cwd */
const gitStatusCache = new Map<string, { result: GitStatus; timestamp: number }>();
const GIT_STATUS_CACHE_TTL = 30_000;

/**
 * Detect git push/pull status for a working directory.
 * Returns ahead/behind counts relative to remote tracking branch.
 */
export async function detectGitStatus(
  cwd: string,
  execFileAsync: (cmd: string, args: string[], opts: { cwd: string; timeout: number }) => Promise<{ stdout: string }>
): Promise<GitStatus> {
  const cached = gitStatusCache.get(cwd);
  if (cached && Date.now() - cached.timestamp < GIT_STATUS_CACHE_TTL) {
    return cached.result;
  }

  const result: GitStatus = { ahead: 0, behind: 0, hasUpstream: false, isDirty: false };

  try {
    // Run upstream check, ahead/behind, and dirty check in parallel
    const [upstreamResult, dirtyResult] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--verify', '@{u}'], { cwd, timeout: 3000 })
        .then(() => true)
        .catch(() => false),
      execFileAsync('git', ['status', '--porcelain'], { cwd, timeout: 3000 })
        .then(({ stdout }) => stdout.trim().length > 0)
        .catch(() => false),
    ]);

    result.hasUpstream = upstreamResult;
    result.isDirty = dirtyResult;

    if (result.hasUpstream) {
      try {
        const { stdout } = await execFileAsync(
          'git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'],
          { cwd, timeout: 3000 }
        );
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 2) {
          result.behind = parseInt(parts[0], 10) || 0;
          result.ahead = parseInt(parts[1], 10) || 0;
        }
      } catch {
        // Failed to get counts — leave at 0
      }
    }
  } catch {
    // Git not available or not a repo — return defaults
  }

  gitStatusCache.set(cwd, { result, timestamp: Date.now() });
  return result;
}

/** Clear cached git status for a specific cwd (e.g., after a git push) */
export function clearGitStatusCache(cwd: string) {
  gitStatusCache.delete(cwd);
}
