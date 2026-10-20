import { addGoal, representDay, selectPriority, setDailyCheck, setMetric } from "./operations.ts";
import type { DailyCheck, Metric, Scorecard } from "./operations.ts";
import { SAMPLE, sampleScorecard } from "./sample.ts";

export type Panel = "setup" | "training" | "profile" | "meal" | "nutrition" | "activity" | "mindset" | "map" | "ltr";
export type AccountState = Readonly<{ email: string; busy: boolean; problem: string }>;
export type ScorecardModel = Readonly<{
  day: Scorecard;
  drafts: Readonly<Record<Metric, string>>;
  errors: Readonly<Partial<Record<Metric, string>>>;
  card: number;
  touchX: number | undefined;
  panel: Panel | undefined;
  goalDraft: string;
  message: string;
  account: AccountState;
}>;
export type ScorecardProposal =
  | Readonly<{ kind: "metricChanged"; metric: Metric; value: string }>
  | Readonly<{ kind: "metricCommitted" | "metricCancelled"; metric: Metric }>
  | Readonly<{ kind: "checkToggled"; check: DailyCheck }>
  | Readonly<{ kind: "cardSelected"; card: number }>
  | Readonly<{ kind: "touchStarted" | "touchEnded"; x: number }>
  | Readonly<{ kind: "panelOpened"; panel: Panel }>
  | Readonly<{ kind: "panelClosed" | "goalAdded" | "sampleReset" }>
  | Readonly<{ kind: "goalDraftChanged" | "brainDumpChanged"; value: string }>
  | Readonly<{ kind: "prioritySelected" | "goalRemoved"; id: number }>
  | Readonly<{ kind: "accountChanged"; account: AccountState }>;

export function initialScorecardModel(account: AccountState): ScorecardModel {
  return { day: sampleScorecard(), drafts: { weight: "77.5", energy: "", protein: "", water: "", sleep: "", steps: "" },
    errors: {}, card: 0, touchX: undefined, panel: undefined, goalDraft: "", message: "", account };
}

/** One pure acceptor owns all scorecard interaction state. The preview has no storage/network effects. */
export function acceptScorecardProposal(model: ScorecardModel, proposal: ScorecardProposal): ScorecardModel {
  switch (proposal.kind) {
    case "metricChanged": return { ...model, drafts: { ...model.drafts, [proposal.metric]: proposal.value }, message: "",
      errors: { ...model.errors, [proposal.metric]: "" } };
    case "metricCancelled": return { ...model, drafts: { ...model.drafts, [proposal.metric]: String(model.day.values[proposal.metric] ?? "") },
      errors: { ...model.errors, [proposal.metric]: "" } };
    case "metricCommitted": {
      const result = setMetric({ scorecard: model.day, metric: proposal.metric, value: model.drafts[proposal.metric] });
      if (!result.ok) return { ...model, errors: { ...model.errors, [proposal.metric]: result.error.message } };
      return { ...model, day: result.value, drafts: { ...model.drafts, [proposal.metric]: String(result.value.values[proposal.metric] ?? "") },
        errors: { ...model.errors, [proposal.metric]: "" } };
    }
    case "checkToggled": {
      const result = setDailyCheck({ scorecard: model.day, check: proposal.check, complete: !model.day.checks[proposal.check] });
      return result.ok ? { ...model, day: result.value } : model;
    }
    case "cardSelected": return Number.isInteger(proposal.card) && proposal.card >= 0 && proposal.card <= 2
      ? { ...model, card: proposal.card } : model;
    case "touchStarted": return { ...model, touchX: proposal.x };
    case "touchEnded": {
      const distance = model.touchX === undefined ? 0 : model.touchX - proposal.x;
      return { ...model, touchX: undefined, card: Math.max(0, Math.min(2, model.card + (Math.abs(distance) >= 40 ? Math.sign(distance) : 0))) };
    }
    case "panelOpened": return { ...model, panel: proposal.panel, message: "" };
    case "panelClosed": return { ...model, panel: undefined, message: "" };
    case "goalDraftChanged": return { ...model, goalDraft: proposal.value, message: "" };
    case "brainDumpChanged": return { ...model, day: { ...model.day, brainDump: proposal.value } };
    case "goalAdded": {
      const result = addGoal({ scorecard: model.day, text: model.goalDraft });
      return result.ok ? { ...model, day: result.value, goalDraft: "", message: "" } : { ...model, message: result.error.message };
    }
    case "prioritySelected": {
      const result = selectPriority({ scorecard: model.day, id: proposal.id });
      return result.ok ? { ...model, day: result.value } : model;
    }
    case "goalRemoved": return { ...model, day: { ...model.day, goals: model.day.goals.filter(goal => goal.id !== proposal.id) } };
    case "sampleReset": return { ...initialScorecardModel(model.account), panel: "profile", message: "Sample day reset." };
    case "accountChanged": return { ...model, account: proposal.account };
  }
}

export function representScorecard(model: ScorecardModel) {
  const weights = [...SAMPLE.weights, model.day.values.weight ?? SAMPLE.startWeight];
  const min = Math.min(...weights), max = Math.max(...weights), range = max - min || 1;
  const points = weights.map((weight, i) => `${(i / (weights.length - 1) * 310).toFixed(1)},${((max - weight) / range * 70 + 5).toFixed(1)}`).join(" ");
  const difference = SAMPLE.startWeight - (model.day.values.weight ?? SAMPLE.startWeight);
  const tracked = SAMPLE.history.reduce((total, day) => total + day.nutrition + day.activity + day.mindset, 0);
  return { ...model, ...representDay(model.day), weightDelta: Math.abs(difference).toFixed(1), weightDown: difference >= 0,
    trendPoints: points, consistency: Math.round(tracked / (SAMPLE.history.length * 9) * 100) } as const;
}

export type ScorecardState = ReturnType<typeof representScorecard>;

/** The only effect in this in-memory preview is native dialog presentation/focus. */
export function nextScorecardAction(model: ScorecardModel) {
  return model.panel ? { kind: "showPanel", panel: model.panel } as const : { kind: "closePanel" } as const;
}
