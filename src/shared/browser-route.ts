/** Feature-owned policy, shared by in-app transitions and native unload protection. */
export type NavigationGuard = Readonly<{ kind: "ready" }> | Readonly<{ kind: "confirm" | "blocked"; message: string }>;
export type RouteHost = Readonly<{
  navigate: (href: string) => void;
  replaceQuery: (key: "date", value: string) => void;
  navigationChanged: (guard: NavigationGuard) => void;
}>;
export type RouteRuntime = Readonly<{
  navigation: () => NavigationGuard;
  dispose: () => void;
  revisit?: () => void;
  retain?: (href: string) => void;
  updateAccount?: (input: Readonly<{ account: Readonly<{ email: string; busy: boolean; problem: string }> }>) => void;
}>;
