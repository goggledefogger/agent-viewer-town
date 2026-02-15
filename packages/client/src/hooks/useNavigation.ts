import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { GroupedSessionsList, ProjectGroup, BranchGroup } from '@agent-viewer/shared';

export type ZoomLevel = 0 | 1 | 2;

export interface BreadcrumbSegment {
  label: string;
  level: ZoomLevel;
  projectKey?: string;
  branch?: string;
  isCurrent: boolean;
}

interface NavigationState {
  zoomLevel: ZoomLevel;
  projectKey?: string;
  branch?: string;
  isOpen: boolean;
  searchFilter: string;
  hideIdle: boolean;
}

export interface UseNavigationReturn {
  // State
  zoomLevel: ZoomLevel;
  projectKey?: string;
  branch?: string;
  isOpen: boolean;
  searchFilter: string;
  hideIdle: boolean;

  // Actions
  zoomTo: (level: ZoomLevel, projectKey?: string, branch?: string) => void;
  toggleOpen: () => void;
  close: () => void;
  setSearchFilter: (filter: string) => void;
  toggleHideIdle: () => void;

  // Computed views
  currentProject?: ProjectGroup;
  currentBranch?: BranchGroup;
  visibleProjects: ProjectGroup[];
  breadcrumbs: BreadcrumbSegment[];
  /** Total sessions needing input across all projects */
  waitingCount: number;
}

const HIDE_IDLE_KEY = 'agent-viewer-nav-hide-idle';

export function useNavigation(
  grouped: GroupedSessionsList | null
): UseNavigationReturn {
  const [navState, setNavState] = useState<NavigationState>(() => ({
    zoomLevel: 0,
    isOpen: false,
    searchFilter: '',
    hideIdle: (() => {
      try {
        return localStorage.getItem(HIDE_IDLE_KEY) === 'true';
      } catch {
        return false;
      }
    })(),
  }));

  // Track whether user has manually navigated — prevents auto-zoom from
  // re-firing on every WebSocket update and trapping the user
  const hasUserNavigated = useRef(false);

  // Persist hideIdle preference
  useEffect(() => {
    try {
      localStorage.setItem(HIDE_IDLE_KEY, String(navState.hideIdle));
    } catch {
      // ignore
    }
  }, [navState.hideIdle]);

  const zoomTo = useCallback((level: ZoomLevel, projectKey?: string, branch?: string) => {
    hasUserNavigated.current = true;
    setNavState((prev) => ({
      ...prev,
      zoomLevel: level,
      projectKey: level >= 1 ? projectKey : undefined,
      branch: level >= 2 ? branch : undefined,
    }));
  }, []);

  const toggleOpen = useCallback(() => {
    setNavState((prev) => ({
      ...prev,
      isOpen: !prev.isOpen,
      // Reset search when opening
      searchFilter: prev.isOpen ? prev.searchFilter : '',
    }));
  }, []);

  const close = useCallback(() => {
    setNavState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const setSearchFilter = useCallback((filter: string) => {
    setNavState((prev) => ({ ...prev, searchFilter: filter }));
  }, []);

  const toggleHideIdle = useCallback(() => {
    setNavState((prev) => ({ ...prev, hideIdle: !prev.hideIdle }));
  }, []);

  const projects = grouped?.projects ?? [];

  // Auto-zoom on initial mount: if only 1 project, zoom to it; 1 project + 1 branch → zoom to branch.
  // Once the user has manually navigated (via zoomTo), auto-zoom is permanently disabled so
  // WebSocket updates can't trap the user by re-zooming them away from level 0.
  useEffect(() => {
    if (hasUserNavigated.current) return;
    if (projects.length === 0) return;
    setNavState((prev) => {
      if (prev.zoomLevel !== 0) return prev;
      if (projects.length === 1) {
        const p = projects[0];
        if (p.branches.length === 1) {
          return { ...prev, zoomLevel: 2 as ZoomLevel, projectKey: p.projectKey, branch: p.branches[0].branch };
        }
        return { ...prev, zoomLevel: 1 as ZoomLevel, projectKey: p.projectKey };
      }
      return prev;
    });
  }, [projects]);

  // Find current project and branch
  const currentProject = useMemo(() => {
    if (navState.zoomLevel < 1 || !navState.projectKey) return undefined;
    return projects.find((p) => p.projectKey === navState.projectKey);
  }, [projects, navState.zoomLevel, navState.projectKey]);

  const currentBranch = useMemo(() => {
    if (navState.zoomLevel < 2 || !navState.branch || !currentProject) return undefined;
    return currentProject.branches.find((b) => b.branch === navState.branch);
  }, [currentProject, navState.zoomLevel, navState.branch]);

  // Filter projects based on search and idle settings
  const visibleProjects = useMemo(() => {
    let result = projects;
    const filter = navState.searchFilter.toLowerCase().trim();

    if (filter) {
      result = result
        .map((project) => {
          // Check if project name matches
          const projectMatches = project.projectName.toLowerCase().includes(filter);

          // Filter branches that match
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

    if (navState.hideIdle) {
      const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
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
  }, [projects, navState.searchFilter, navState.hideIdle]);

  // Build breadcrumbs — always include a clickable root segment when zoomed in
  // so the user can always navigate back to the top level.
  const breadcrumbs = useMemo((): BreadcrumbSegment[] => {
    const segments: BreadcrumbSegment[] = [];
    const totalProjects = projects.length;

    if (navState.zoomLevel === 0) {
      segments.push({
        label: totalProjects <= 1 ? (projects[0]?.projectName || 'Sessions') : `${totalProjects} Projects`,
        level: 0,
        isCurrent: true,
      });
    } else {
      // Always show a clickable root breadcrumb when zoomed in, even with single project
      segments.push({
        label: totalProjects > 1 ? 'All' : 'Sessions',
        level: 0,
        isCurrent: false,
      });
    }

    if (navState.zoomLevel >= 1 && currentProject) {
      segments.push({
        label: currentProject.projectName,
        level: 1,
        projectKey: currentProject.projectKey,
        isCurrent: navState.zoomLevel === 1,
      });
    }

    if (navState.zoomLevel >= 2 && currentBranch) {
      segments.push({
        label: currentBranch.branch,
        level: 2,
        projectKey: navState.projectKey,
        branch: currentBranch.branch,
        isCurrent: true,
      });
    }

    return segments;
  }, [navState.zoomLevel, navState.projectKey, currentProject, currentBranch, projects]);

  const waitingCount = useMemo(() => {
    return projects.filter((p) => p.hasWaitingAgent).reduce((count, p) => {
      return count + p.branches.reduce((bc, b) => {
        return bc + b.sessions.filter((s) => s.hasWaitingAgent).length;
      }, 0);
    }, 0);
  }, [projects]);

  return {
    // State
    zoomLevel: navState.zoomLevel,
    projectKey: navState.projectKey,
    branch: navState.branch,
    isOpen: navState.isOpen,
    searchFilter: navState.searchFilter,
    hideIdle: navState.hideIdle,

    // Actions
    zoomTo,
    toggleOpen,
    close,
    setSearchFilter,
    toggleHideIdle,

    // Computed
    currentProject,
    currentBranch,
    visibleProjects,
    breadcrumbs,
    waitingCount,
  };
}
