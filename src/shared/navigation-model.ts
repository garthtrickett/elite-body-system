import type { AppPage } from "./app-routes.ts";
export type ResolvedRoute = Readonly<{ href: string; page: AppPage | "sign-in"; accountId: string | null }>;
export type RouteTarget = Readonly<{ href: string; index?: number }>;
export type NavigationEffect = Readonly<{ id: number; target: RouteTarget }> & (
  | Readonly<{ kind: "resolve" }>
  | Readonly<{ kind: "authorize"; route: ResolvedRoute }>
);
export type NavigationModel = Readonly<{
  current: ResolvedRoute; index: number; sequence: number; committed: number;
  pending: NavigationEffect | undefined; error: string; retry: RouteTarget | undefined;
}>;
export type NavigationProposal =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "locationUpdated"; href: string }>
  | Readonly<{ kind: "requested"; target: RouteTarget }>
  | Readonly<{ kind: "resolved"; id: number; route: ResolvedRoute }>
  | Readonly<{ kind: "authorized"; id: number; accepted: boolean; message: string }>
  | Readonly<{ kind: "failed"; id: number }>;
export function initialNavigation(current: ResolvedRoute): NavigationModel {
  return { current, index: 0, sequence: 0, committed: 0, pending: undefined, error: "", retry: undefined };
}
export function acceptNavigation(model: NavigationModel, proposal: NavigationProposal): NavigationModel {
  if (proposal.kind === "locationUpdated") return { ...model, current: { ...model.current, href: proposal.href } };
  if (proposal.kind === "cancelled") return { ...model, sequence: model.sequence + 1, pending: undefined, error: "", retry: undefined };
  if (proposal.kind === "requested") return { ...model, sequence: model.sequence + 1, error: "", retry: undefined,
    pending: { kind: "resolve", id: model.sequence + 1, target: proposal.target } };
  const effect = model.pending;
  if (!effect || effect.id !== proposal.id) return model;
  if (proposal.kind === "failed") return { ...model, pending: undefined, error: "Navigation could not load. Your current page is kept. Try again.", retry: effect.target };
  if (proposal.kind === "resolved") return effect.kind !== "resolve" ? model : { ...model, sequence: model.sequence + 1,
    pending: { ...effect, kind: "authorize", id: model.sequence + 1, route: proposal.route } };
  if (effect.kind !== "authorize") return model;
  return proposal.accepted ? { ...model, current: effect.route, index: effect.target.index ?? (effect.route.href === model.current.href ? model.index : model.index + 1), committed: effect.id, pending: undefined, error: "" }
    : { ...model, pending: undefined, error: proposal.message };
}
