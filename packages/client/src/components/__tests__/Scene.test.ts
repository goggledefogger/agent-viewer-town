import { expect, test, describe } from "bun:test";
import {
  computeTeamPositions,
  computeAllPositions,
  STATION_POSITIONS,
  SOLO_POSITION,
  SUBAGENT_OFFSETS
} from "../Scene";
import type { AgentState } from "@agent-viewer/shared";

describe("Scene Layout Logic", () => {
  describe("computeTeamPositions", () => {
    test("should position main agents with classic roles correctly", () => {
      const agents: AgentState[] = [
        { id: "a1", name: "Lead", role: "lead", status: "idle", isSubagent: false },
        { id: "a2", name: "Researcher", role: "researcher", status: "idle", isSubagent: false },
      ];

      const positions = computeTeamPositions(agents);

      expect(positions.get("a1")).toEqual(STATION_POSITIONS["lead"]);
      expect(positions.get("a2")).toEqual(STATION_POSITIONS["researcher"]);
    });

    test("should use fallback position for unknown roles", () => {
      const agents: AgentState[] = [
        { id: "a1", name: "Unknown", role: "hacker", status: "idle", isSubagent: false },
      ];

      const positions = computeTeamPositions(agents);

      // Fallback: { x: 200 + i * 180, y: 250 }
      expect(positions.get("a1")).toEqual({ x: 200, y: 250 });
    });

    test("should trigger grid layout for duplicate roles", () => {
      const agents: AgentState[] = [
        { id: "a1", name: "Imp 1", role: "implementer", status: "idle", isSubagent: false },
        { id: "a2", name: "Imp 2", role: "implementer", status: "idle", isSubagent: false },
      ];

      const positions = computeTeamPositions(agents);

      // Grid layout calculations for 2 columns:
      // cols = 2, rows = 1
      // xPad = 120, xSpan = 900 - 240 = 660
      // x = xPad + (col / (cols - 1)) * xSpan
      // a1 (col 0): 120 + (0/1) * 660 = 120
      // a2 (col 1): 120 + (1/1) * 660 = 780
      // y = rows === 1 ? 280 : ... = 280

      expect(positions.get("a1")).toEqual({ x: 120, y: 280 });
      expect(positions.get("a2")).toEqual({ x: 780, y: 280 });
    });

    test("should trigger grid layout for more than 5 agents", () => {
      const agents: AgentState[] = Array.from({ length: 6 }, (_, i) => ({
        id: `a${i}`,
        name: `Agent ${i}`,
        role: ["lead", "researcher", "implementer", "tester", "planner", "hacker"][i],
        status: "idle",
        isSubagent: false,
      }));

      const positions = computeTeamPositions(agents);

      // With 6 agents: cols = 4, rows = 2
      expect(positions.size).toBe(6);
      // a0 should be at top-left of grid
      expect(positions.get("a0")).toEqual({ x: 120, y: 140 });
    });

    test("should position subagents around their parent with predefined offsets", () => {
      const agents: AgentState[] = [
        { id: "p1", name: "Parent", role: "lead", status: "idle", isSubagent: false },
        { id: "s1", name: "Sub 1", role: "sub", status: "idle", isSubagent: true, parentAgentId: "p1" },
        { id: "s2", name: "Sub 2", role: "sub", status: "idle", isSubagent: true, parentAgentId: "p1" },
      ];

      const positions = computeTeamPositions(agents);
      const parentPos = STATION_POSITIONS["lead"];

      // Subagent offsets are multiplied by scale (1 if <= 3 main agents)
      // and clamped: x in [60, 840], y in [80, 430]
      const expectedS1 = {
        x: Math.max(60, Math.min(840, parentPos.x + SUBAGENT_OFFSETS[0].x)),
        y: Math.max(80, Math.min(430, parentPos.y + SUBAGENT_OFFSETS[0].y)),
      };

      expect(positions.get("s1")).toEqual(expectedS1);
    });

    test("should use circular layout for many subagents", () => {
      const agents: AgentState[] = [
        { id: "p1", name: "Parent", role: "lead", status: "idle", isSubagent: false },
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `s${i}`,
          name: `Sub ${i}`,
          role: "sub",
          status: "idle" as const,
          isSubagent: true,
          parentAgentId: "p1",
        })),
      ];

      const positions = computeTeamPositions(agents);
      expect(positions.size).toBe(11);

      // For many subagents, it uses circular layout.
      // We just check that they are all positioned and different.
      const subPos0 = positions.get("s0")!;
      const subPos1 = positions.get("s1")!;
      expect(subPos0).not.toEqual(subPos1);
    });
  });

  describe("computeAllPositions", () => {
    test("should use solo position for a single agent", () => {
      const agents: AgentState[] = [
        { id: "a1", name: "Solo", role: "lead", status: "idle", isSubagent: false },
      ];

      const positions = computeAllPositions(agents);
      expect(positions.get("a1")).toEqual({ x: 450, y: 300 });
    });

    test("should position subagents around solo agent", () => {
      const agents: AgentState[] = [
        { id: "a1", name: "Solo", role: "lead", status: "idle", isSubagent: false },
        { id: "s1", name: "Sub 1", role: "sub", status: "idle", isSubagent: true, parentAgentId: "a1" },
      ];

      const positions = computeAllPositions(agents);

      // SOLO_POSITION + SUBAGENT_OFFSETS[0] (clamped)
      const expectedS1 = {
        x: Math.max(60, Math.min(840, SOLO_POSITION.x + SUBAGENT_OFFSETS[0].x)),
        y: Math.max(80, Math.min(430, SOLO_POSITION.y + SUBAGENT_OFFSETS[0].y)),
      };
      expect(positions.get("s1")).toEqual(expectedS1);
    });

    test("should delegate to computeTeamPositions for multiple agents", () => {
      const agents: AgentState[] = [
        { id: "a1", name: "A1", role: "lead", status: "idle", isSubagent: false },
        { id: "a2", name: "A2", role: "researcher", status: "idle", isSubagent: false },
      ];

      const positions = computeAllPositions(agents);
      expect(positions.get("a1")).toEqual(STATION_POSITIONS["lead"]);
      expect(positions.get("a2")).toEqual(STATION_POSITIONS["researcher"]);
    });
  });
});
