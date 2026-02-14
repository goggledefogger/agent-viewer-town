import { describe, it, expect } from 'vitest';
import { getBranchColor, ROLE_COLORS, BRANCH_PALETTE } from '../colors';

describe('getBranchColor', () => {
  it('returns green for "main"', () => {
    expect(getBranchColor('main')).toBe('#4CAF50');
  });

  it('returns green for "master"', () => {
    expect(getBranchColor('master')).toBe('#4CAF50');
  });

  it('is case-insensitive for main/master', () => {
    expect(getBranchColor('Main')).toBe('#4CAF50');
    expect(getBranchColor('MASTER')).toBe('#4CAF50');
  });

  it('returns a non-green color for feature branches', () => {
    const color = getBranchColor('feature/my-feature');
    expect(color).not.toBe('#4CAF50');
    expect(BRANCH_PALETTE).toContain(color);
  });

  it('is deterministic — same branch always gets same color', () => {
    const color1 = getBranchColor('feature/auth-flow');
    const color2 = getBranchColor('feature/auth-flow');
    expect(color1).toBe(color2);
  });

  it('different branches can get different colors', () => {
    const colors = new Set([
      getBranchColor('feature/a'),
      getBranchColor('fix/b'),
      getBranchColor('release/1.0'),
      getBranchColor('dev'),
      getBranchColor('experiment/x'),
    ]);
    // Not all branches will hash to the same color
    expect(colors.size).toBeGreaterThan(1);
  });

  it('never returns a color outside the palette', () => {
    const testBranches = [
      'feature/test', 'fix/bug', 'release/v2', 'staging',
      'develop', 'experiment/ai', 'hotfix/urgent',
    ];
    for (const branch of testBranches) {
      expect(BRANCH_PALETTE).toContain(getBranchColor(branch));
    }
  });
});

describe('ROLE_COLORS', () => {
  it('has colors for all standard roles', () => {
    expect(ROLE_COLORS.lead).toBeDefined();
    expect(ROLE_COLORS.researcher).toBeDefined();
    expect(ROLE_COLORS.implementer).toBeDefined();
    expect(ROLE_COLORS.tester).toBeDefined();
    expect(ROLE_COLORS.planner).toBeDefined();
  });

  it('uses distinct colors for each role', () => {
    const colors = Object.values(ROLE_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});
