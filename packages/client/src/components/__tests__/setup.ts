import { mock } from "bun:test";

mock.module("react", () => ({
  useState: (initial: any) => [initial, () => {}],
  useEffect: () => {},
  useMemo: (factory: () => any) => factory(),
  useCallback: (callback: any) => callback,
  useRef: (initial: any) => ({ current: initial }),
}));

mock.module("react/jsx-runtime", () => ({
  jsx: () => ({}),
  jsxs: () => ({}),
  Fragment: () => ({}),
}));

mock.module("react/jsx-dev-runtime", () => ({
  jsxDEV: () => ({}),
  jsxsDEV: () => ({}),
  Fragment: () => ({}),
}));

mock.module("../AgentCharacter", () => ({
  AgentCharacter: () => null,
  getBranchColor: () => "#ffffff",
}));

mock.module("../Machine", () => ({
  Machine: () => null,
}));
