import type { DailyCheck, Metric } from "./operations.ts";
import type { Panel } from "./browser-model.ts";
import type { ProfileProposal } from "../profile/browser.ts";

export type ScorecardActions = Readonly<{
  changeMetric: (input: Readonly<{ metric: Metric; value: string }>) => void;
  commitMetric: (input: Readonly<{ metric: Metric }>) => void;
  cancelMetric: (input: Readonly<{ metric: Metric }>) => void;
  toggleCheck: (input: Readonly<{ check: DailyCheck }>) => void;
  selectCard: (input: Readonly<{ card: number }>) => void;
  startTouch: (input: Readonly<{ x: number }>) => void;
  endTouch: (input: Readonly<{ x: number }>) => void;
  openPanel: (input: Readonly<{ panel: Panel }>) => void;
  closePanel: () => void;
  changeGoalDraft: (input: Readonly<{ value: string }>) => void;
  changeBrainDump: (input: Readonly<{ value: string }>) => void;
  addGoal: () => void;
  selectPriority: (input: Readonly<{ id: number }>) => void;
  removeGoal: (input: Readonly<{ id: number }>) => void;
  proposeProfile: (proposal: ProfileProposal) => void;
  retrySync: () => void;
  reloadClient: () => void;
  signOut: () => void;
}>;
