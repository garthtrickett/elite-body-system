import { LINK_ACKNOWLEDGEMENT, isHarryPreviewAlias } from "./contracts.ts";
import type { Account, AuthResult, LinkAcknowledgement } from "./contracts.ts";
import { normalizeEmail } from "./email.ts";

export type AuthUiMode = "request" | "confirm" | "home";
type AuthUiIntent =
  | Readonly<{ kind: "request"; email: string }>
  | Readonly<{ kind: "inspect" | "redeem" | "session" | "signOut" | "harryPreview" }>
  | Readonly<{ kind: "navigate"; to: "/" | "/sign-in" }>;
export type AuthUiEffect = Readonly<{ id: number }> & AuthUiIntent;
export type AuthUiModel = Readonly<{
  mode: AuthUiMode; email: string; account: Account | undefined; message: string; problem: string;
  started: boolean; revision: number; pending: AuthUiEffect | undefined;
}>;
export type AuthUiProposal =
  | Readonly<{ kind: "started" | "linkRequested" | "redemptionRequested" | "signOutRequested" }>
  | Readonly<{ kind: "emailChanged"; email: string }>
  | Readonly<{ kind: "requestCompleted"; id: number; result: AuthResult<LinkAcknowledgement> }>
  | Readonly<{ kind: "inspectionCompleted" | "redemptionCompleted" | "sessionCompleted" | "previewCompleted"; id: number; result: AuthResult<Account> }>
  | Readonly<{ kind: "signOutCompleted"; id: number; result: AuthResult<Readonly<{ signedOut: true }>> }>
  | Readonly<{ kind: "effectFailed"; id: number }>;
export type AuthUiState = Readonly<{
  mode: AuthUiMode; email: string; account: Account | undefined;
  busy: boolean; busyLabel: string; message: string; problem: string;
}>;

export function initialAuthUiModel(mode: AuthUiMode): AuthUiModel {
  return { mode, email: "", account: undefined, message: "", problem: "",
    started: false, revision: 0, pending: undefined };
}

function schedule(model: AuthUiModel, effect: AuthUiIntent): AuthUiModel {
  const id = model.revision + 1;
  const pending: AuthUiEffect = { ...effect, id };
  return { ...model, revision: id, pending, message: "", problem: "" };
}

const INVALID_LINK = "This link has expired or has already been used. Request a new one.";
function failed(model: AuthUiModel): AuthUiModel {
  const problem = model.pending?.kind === "request"
    ? "We couldn’t confirm your request. Check your email before trying again."
    : model.pending?.kind === "signOut" ? "We couldn’t confirm sign-out. Please try again."
    : model.pending?.kind === "redeem" ? "Sign-in is temporarily unavailable. Please try again."
    : "Your account is temporarily unavailable. Please reload to try again.";
  return { ...model, pending: undefined, problem };
}

/** Pure SAM model acceptor: the only authority that accepts proposals and changes UI state. */
export function acceptAuthUiProposal(model: AuthUiModel, proposal: AuthUiProposal): AuthUiModel {
  switch (proposal.kind) {
    case "started": {
      if (model.started) return model;
      const started = { ...model, started: true };
      return model.mode === "request" ? started : schedule(started, { kind: model.mode === "confirm" ? "inspect" : "session" });
    }
    case "emailChanged":
      return model.mode === "request" && !model.pending ? { ...model, email: proposal.email } : model;
    case "linkRequested": {
      if (model.mode !== "request" || model.pending) return model;
      if (isHarryPreviewAlias(model.email)) return schedule(model, { kind: "harryPreview" });
      const email = normalizeEmail(model.email);
      return email ? schedule(model, { kind: "request", email })
        : { ...model, problem: "Enter a valid email address.", message: "" };
    }
    case "redemptionRequested":
      return model.mode === "confirm" && model.account && !model.pending ? schedule(model, { kind: "redeem" }) : model;
    case "signOutRequested":
      return model.mode === "home" && model.account && !model.pending ? schedule(model, { kind: "signOut" }) : model;
  }
  if (model.pending?.id !== proposal.id) return model;
  switch (proposal.kind) {
    case "effectFailed": return failed(model);
    case "requestCompleted":
      if (model.pending.kind !== "request") return model;
      return proposal.result.ok ? { ...model, pending: undefined, message: LINK_ACKNOWLEDGEMENT }
        : failed(model);
    case "inspectionCompleted":
      if (model.pending.kind !== "inspect") return model;
      if (proposal.result.ok) return { ...model, pending: undefined, account: proposal.result.value };
      return proposal.result.error.code === "unavailable" ? failed(model)
        : { ...model, pending: undefined, account: undefined, problem: INVALID_LINK };
    case "previewCompleted":
      if (model.pending.kind !== "harryPreview") return model;
      return proposal.result.ok ? schedule({ ...model, account: proposal.result.value }, { kind: "navigate", to: "/" })
        : { ...model, pending: undefined, problem: proposal.result.error.code === "unauthenticated" ? "Preview sign-in is unavailable. Use your email address or try again later." : "Sign-in is temporarily unavailable. Please try again." };
    case "redemptionCompleted":
      if (model.pending.kind !== "redeem") return model;
      if (proposal.result.ok) return schedule({ ...model, account: proposal.result.value }, { kind: "navigate", to: "/" });
      return proposal.result.error.code === "unavailable" ? failed(model)
        : { ...model, pending: undefined, account: undefined, problem: INVALID_LINK };
    case "sessionCompleted":
      if (model.pending.kind !== "session") return model;
      if (proposal.result.ok) return { ...model, pending: undefined, account: proposal.result.value };
      return proposal.result.error.code === "unauthenticated" ? schedule(model, { kind: "navigate", to: "/sign-in" }) : failed(model);
    case "signOutCompleted":
      if (model.pending.kind !== "signOut") return model;
      return proposal.result.ok ? schedule(model, { kind: "navigate", to: "/sign-in" }) : failed(model);
  }
}

/** SAM state representation: renderable data derived from the accepted model, no effects. */
export function representAuthUi(model: AuthUiModel): AuthUiState {
  const labels = { harryPreview: "Signing you in…", request: "Sending your link…", inspect: "Checking your link…", redeem: "Signing you in…",
    session: "Loading your account…", signOut: "Signing out…", navigate: "Continuing…" } as const;
  return { mode: model.mode, email: model.email, account: model.account, message: model.message, problem: model.problem,
    busy: model.pending !== undefined, busyLabel: model.pending ? labels[model.pending.kind] : "" };
}

/** Next-action predicate: only the model's accepted pending effect may run. */
export function nextAuthUiAction(model: AuthUiModel): AuthUiEffect | undefined {
  return model.pending;
}
