/**
 * Proposed color palette extensions for hierarchical navigation, inbox, and task scene elements.
 *
 * These extend the existing palette in packages/client/src/constants/colors.ts
 * and CSS variables in packages/client/src/styles/index.css.
 *
 * All colors are derived from the existing 8-bit Workshop-in-the-Woods palette.
 * No new "base" colors — only new semantic uses.
 */

// ============================================================
// CSS VARIABLE ADDITIONS (add to :root in index.css)
// ============================================================

export const CSS_VAR_ADDITIONS = `
  /* Notification priority — reuses existing palette */
  --color-notif-urgent:  #DC3545;  /* same as --color-red */
  --color-notif-warning: #FFCA28;  /* amber, from BRANCH_PALETTE */
  --color-notif-info:    #4169E1;  /* same as --color-blue */
  --color-notif-success: #28A745;  /* same as --color-green */

  /* Navigation chrome */
  --color-nav-active:    #FFD700;  /* gold highlight for active tree node */
  --color-nav-hover:     rgba(65, 105, 225, 0.12);  /* blue tint on hover */
  --color-nav-indent:    #334155;  /* vertical indent guide lines */

  /* Zoom controls */
  --color-zoom-btn-bg:      #16213e;  /* button background */
  --color-zoom-btn-border:  #334155;  /* button border */
`;

// ============================================================
// TypeScript constants (add to constants/colors.ts)
// ============================================================

/** Notification priority colors */
export const NOTIF_COLORS = {
  urgent:  '#DC3545',
  warning: '#FFCA28',
  info:    '#4169E1',
  success: '#28A745',
} as const;

/**
 * Maps NotificationType (from data-model-proposal.ts) to visual priority.
 * Used to select the correct icon and left-border color for notification cards.
 */
export const NOTIF_TYPE_TO_PRIORITY: Record<string, keyof typeof NOTIF_COLORS> = {
  permission_request: 'urgent',
  ask_user_question:  'urgent',
  plan_approval:      'warning',
  task_completed:     'success',
  agent_error:        'urgent',
  agent_idle:         'warning',
  agent_stopped:      'info',
};

/** Task status colors for SVG scene elements (matches CSS vars) */
export const TASK_STATUS_COLORS = {
  pending:     '#6C757D',
  in_progress: '#4169E1',
  completed:   '#28A745',
} as const;

/** Navigation level indicators */
export const NAV_LEVEL_COLORS = {
  project: '#FFD700',    // gold
  branch:  'dynamic',    // uses getBranchColor()
  session: '#e2e8f0',    // light text
} as const;

/** SVG task card dimensions (for clipboard style) */
export const TASK_CARD_SVG = {
  width: 22,
  height: 28,
  clipHeight: 4,
  clipWidth: 10,
  statusDotRadius: 2.5,
  stackGap: 4,
  maxVisible: 3,
  offsetFromAgent: { x: 35, y: 12 },
} as const;
