import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { GroupedSessionsList, ProjectGroup, SessionInfo } from '@agent-viewer/shared';

export interface BreadcrumbSegment {
  label: string;
  isCurrent: boolean;
}

interface NavigationState {
  isOpen: boolean;
  searchFilter: string;
  hideIdle: boolean;
}

export interface UseNavigationReturn {
  // State
  isOpen: boolean;
  searchFilter: string;
  hideIdle: boolean;

  // Actions
  toggleOpen: () => void;
  close: () => void;
  setSearchFilter: (filter: string) => void;
  toggleHideIdle: () => void;

  // Computed views
  currentProjectName?: string;
  visibleProjects: ProjectGroup[];
  breadcrumbs: BreadcrumbSegment[];
  /** Total sessions needing input across all projects */
  waitingCount: number;
}

const HIDE_IDLE_KEY = 'agent-viewer-nav-hide-idle';

export function useNavigation(
  grouped: GroupedSessionsList | null,
  activeSession?: SessionInfo
): UseNavigationReturn {
  const [navState, setNavState] = useState<NavigationState>(() => ({
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

  // Persist hideIdle preference
  useEffect(() => {
    try {
      localStorage.setItem(HIDE_IDLE_KEY, String(navState.hideIdle));
    } catch {
      // ignore
    }
  }, [navState.hideIdle]);

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

  // Determine current project name from active session
  const currentProjectName = useMemo(() => {
    if (!activeSession) return undefined;
    const project = projects.find((p) =>
      p.branches.some((b) =>
        b.sessions.some((s) => s.sessionId === activeSession.sessionId)
      )
    );
    return project?.projectName;
  }, [projects, activeSession]);

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
            b.sessions.some((s) => s.hasWaitingAgent || now - s.lastActivity < IDLE_THRESHOLD)
          );
          if (activeBranches.length === 0) return null;
          return { ...project, branches: activeBranches };
        })
        .filter((p): p is ProjectGroup => p !== null);
    }

    return result;
  }, [projects, navState.searchFilter, navState.hideIdle]);

  // Build breadcrumbs - simplified to just show current project or "Projects"
  const breadcrumbs = useMemo((): BreadcrumbSegment[] => {
    const totalProjects = visibleProjects.length;

    if (currentProjectName) {
      return [
        {
          label: currentProjectName,
          isCurrent: true,
        },
      ];
    }

    return [
      {
        label: totalProjects <= 1 ? 'Projects' : `${totalProjects} Projects`,
        isCurrent: true,
      },
    ];
  }, [currentProjectName, visibleProjects]);

  const waitingCount = useMemo(() => {
    return projects.filter((p) => p.hasWaitingAgent).reduce((count, p) => {
      return count + p.branches.reduce((bc, b) => {
        return bc + b.sessions.filter((s) => s.hasWaitingAgent).length;
      }, 0);
    }, 0);
  }, [projects]);

  return {
    // State
    isOpen: navState.isOpen,
    searchFilter: navState.searchFilter,
    hideIdle: navState.hideIdle,

    // Actions
    toggleOpen,
    close,
    setSearchFilter,
    toggleHideIdle,

    // Computed
    currentProjectName,
    visibleProjects,
    breadcrumbs,
    waitingCount,
  };
}
