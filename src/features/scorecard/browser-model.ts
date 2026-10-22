import { addGoal, representDay, selectPriority, setDailyCheck, setMetric } from "./operations.ts";
import type { DailyCheck, Metric, Scorecard } from "./operations.ts";
import { emptyScorecard } from "./operations.ts";
import { emptyProfile, initialProfileUi, acceptProfileProposal } from "../profile/browser.ts";
import type { ProfileUiModel, ProfileProposal, ProfileSnapshot } from "../profile/browser.ts";
import type { StoredDay } from "./client-data.ts";
import { isDay } from "../../shared/validation.ts";
import type { SyncEffect, SyncProposal } from "./browser-sync.ts";

export type Panel = "setup" | "profile" | "ltr";
export type AccountState = Readonly<{ email: string; busy: boolean; problem: string }>;
export type ScorecardUiEffect = Readonly<{ id: number }> & (Readonly<{ kind: "signOut"; confirm: boolean }> | Readonly<{ kind: "navigate"; href: string }> | Readonly<{ kind: "confirmReload" }>);
export type ScorecardUiProposal = Readonly<{ kind: "signOutRequested" }> | Readonly<{ kind: "signOutConfirmed"; id: number; accepted: boolean }> | Readonly<{ kind: "navigationHandled"; id: number }> | Readonly<{ kind: "reloadConfirmed"; id: number; discard: boolean }>;
export type ScorecardEffect = SyncEffect | ScorecardUiEffect;
export type ScorecardModel = Readonly<{
  day: Scorecard;
  drafts: Readonly<Record<Metric, string>>;
  errors: Readonly<Partial<Record<Metric, string>>>;
  card: number;
  touchX: number | undefined;
  panel: Panel | undefined;
  launchPanel: "profile" | "setup" | undefined;
  goalDraft: string;
  message: string;
  account: AccountState;
  exiting: boolean;
  profile: ProfileSnapshot;
  profileUi: ProfileUiModel;
  date: string;
  observedDate: string;
  dayRevision: number;
  history: readonly StoredDay[];
  loaded: boolean;
  syncError: string;
  generation: number;
  savedGeneration: number;
  sequence: number;
  pending: ScorecardEffect | undefined;
}>;
type LocalProposal =
  | Readonly<{ kind: "metricChanged"; metric: Metric; value: string }>
  | Readonly<{ kind: "metricCommitted" | "metricCancelled"; metric: Metric }>
  | Readonly<{ kind: "checkToggled"; check: DailyCheck }>
  | Readonly<{ kind: "cardSelected"; card: number }>
  | Readonly<{ kind: "touchStarted" | "touchEnded"; x: number }>
  | Readonly<{ kind: "panelOpened"; panel: Panel }>
  | Readonly<{ kind: "panelClosed" | "goalAdded" }>
  | Readonly<{ kind: "goalDraftChanged" | "brainDumpChanged"; value: string }>
  | Readonly<{ kind: "prioritySelected" | "goalRemoved"; id: number }>
  | Readonly<{ kind: "accountChanged"; account: AccountState }>
  | Readonly<{ kind: "profileProposed"; proposal: ProfileProposal }>;
export type ScorecardProposal = LocalProposal | SyncProposal | ScorecardUiProposal | Readonly<{ kind: "started" | "retrySync" | "reloadClient" }> | Readonly<{ kind: "dayObserved"; date: string }>;

export function initialScorecardModel(account: AccountState, launchPanel?: "profile" | "setup"): ScorecardModel {
  const profile = emptyProfile();
  return { day: emptyScorecard(), drafts: { weight: "", energy: "", protein: "", water: "", sleep: "", steps: "" },
    errors: {}, card: 0, touchX: undefined, panel: undefined, launchPanel, goalDraft: "", message: "", account, exiting: false,
    profile: { profile, revision: 0 }, profileUi: initialProfileUi(profile), date: "", observedDate: "", dayRevision: 0, history: [],
    loaded: false, syncError: "", generation: 0, savedGeneration: 0, sequence: 0, pending: undefined };
}

/** One pure acceptor owns all scorecard interaction state. Network effects are selected after acceptance. */
function acceptLocal(model: ScorecardModel, proposal: LocalProposal): ScorecardModel {
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
    case "panelOpened": return proposal.panel === "setup" && model.profile.profile.onboardingVersion === "harry-v2" ? schedule(model, { kind: "navigate", href: "/onboarding" })
      : { ...model, panel: proposal.panel, message: "", profileUi: proposal.panel === "setup" && model.profile.profile.completed ? acceptProfileProposal(model.profileUi, { kind: "editSetup" }) : model.profileUi };
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
    case "profileProposed": {
      if (proposal.proposal.kind === "editSetup" && model.profile.profile.onboardingVersion === "harry-v2") return schedule(model, { kind: "navigate", href: "/onboarding" });
      if (model.pending?.kind === "saveProfile") return model;
      const profileUi = acceptProfileProposal(model.profileUi, proposal.proposal);
      return { ...model, profileUi, panel: proposal.proposal.kind === "editSetup" ? "setup" : model.panel, syncError: "" };
    }
    case "accountChanged": return { ...model, account: proposal.account, exiting: proposal.account.problem ? false : model.exiting };
  }
}

function schedule(model: ScorecardModel, intent: Omit<Extract<ScorecardEffect, { kind: "load" | "confirmReload" }>, "id"> | Omit<Extract<ScorecardEffect, { kind: "signOut" }>, "id"> | Omit<Extract<ScorecardEffect, { kind: "navigate" }>, "id"> | Omit<Extract<SyncEffect, { kind: "saveDay" }>, "id"> | Omit<Extract<SyncEffect, { kind: "saveProfile" }>, "id">): ScorecardModel {
  const id = model.sequence + 1;
  return { ...model, sequence: id, pending: { ...intent, id }, syncError: intent.kind === "signOut" || intent.kind === "navigate" || intent.kind === "confirmReload" ? model.syncError : "" };
}
function continueSync(model: ScorecardModel): ScorecardModel {
  if (!model.loaded || model.pending || model.syncError || model.exiting || model.account.busy) return model;
  if (model.generation > model.savedGeneration) return schedule(model, { kind: "saveDay", date: model.date,
    revision: model.dayRevision, scorecard: model.day, generation: model.generation });
  if (model.profileUi.requestedSave) return schedule({ ...model, profileUi: acceptProfileProposal(model.profileUi, { kind: "saveHandled" }) },
    { kind: "saveProfile", revision: model.profile.revision, profile: model.profileUi.draft });
  if (model.observedDate && model.observedDate !== model.date && !model.panel && !hasUnsavedScorecard(model)) return schedule({ ...model, loaded: false }, { kind: "load" });
  return model;
}
function draftsFor(day: Scorecard): Readonly<Record<Metric, string>> {
  return Object.fromEntries(Object.entries(day.values).map(([key, value]) => [key, String(value ?? "")])) as Record<Metric, string>;
}

export function acceptScorecardProposal(model: ScorecardModel, proposal: ScorecardProposal): ScorecardModel {
  switch (proposal.kind) {
    case "signOutRequested": return model.pending || model.account.busy || model.exiting ? model : schedule(model, { kind: "signOut", confirm: hasUnsavedScorecard(model) });
    case "signOutConfirmed": return model.pending?.kind === "signOut" && model.pending.id === proposal.id ? { ...model, pending: undefined, exiting: proposal.accepted && !model.account.problem } : model;
    case "navigationHandled": return model.pending?.kind === "navigate" && model.pending.id === proposal.id ? { ...model, pending: undefined } : model;
    case "dayObserved": return model.loaded && isDay(proposal.date) ? continueSync({ ...model, observedDate: proposal.date }) : model;
    case "started": return model.sequence === 0 ? schedule(model, { kind: "load" }) : model;
    case "reloadClient": return model.pending ? model : hasUnsavedScorecard(model) ? schedule(model, { kind: "confirmReload" }) : schedule({ ...model, loaded: false }, { kind: "load" });
    case "reloadConfirmed": return model.pending?.kind !== "confirmReload" || model.pending.id !== proposal.id ? model : proposal.discard ? schedule({ ...model, loaded: false }, { kind: "load" }) : { ...model, pending: undefined };
    case "retrySync": return model.pending ? model : model.loaded ? continueSync({ ...model, syncError: "" }) : schedule(model, { kind: "load" });
    case "clientLoaded": {
      if (model.pending?.kind !== "load" || model.pending.id !== proposal.id) return model;
      if (!proposal.result.ok) return { ...model, pending: undefined, syncError: proposal.result.error.message };
      const value = proposal.result.value;
      const loadedUi = initialProfileUi(value.profile.profile);
      const profileUi = model.launchPanel === "setup" && value.profile.profile.completed && value.profile.profile.onboardingVersion !== "harry-v2" ? acceptProfileProposal(loadedUi, { kind: "editSetup" }) : loadedUi;
      const loaded = { ...model, loaded: true, pending: undefined, profile: value.profile, profileUi,
        date: value.day.date, observedDate: value.day.date, day: value.day.scorecard, dayRevision: value.day.revision, drafts: draftsFor(value.day.scorecard), history: value.history,
        launchPanel: undefined, panel: model.launchPanel ?? (model.loaded && model.panel === "setup" && model.profile.profile.completed ? "setup" : value.profile.profile.completed ? undefined : "setup"), generation: 0, savedGeneration: 0, syncError: "" };
      return value.profile.profile.onboardingVersion === "harry-v2" && model.launchPanel === "setup" ? schedule({ ...loaded, panel: undefined }, { kind: "navigate", href: "/onboarding" }) : loaded;
    }
    case "daySaved": {
      if (model.pending?.kind !== "saveDay" || model.pending.id !== proposal.id) return model;
      if (!proposal.result.ok) return { ...model, pending: undefined, syncError: proposal.result.error.message };
      const saved = proposal.result.value;
      return continueSync({ ...model, pending: undefined, day: { ...model.day, checks: { ...model.day.checks, training: saved.scorecard.checks.training, map: saved.scorecard.checks.map } }, dayRevision: saved.revision, savedGeneration: model.pending.generation,
        history: [saved, ...model.history.filter(day => day.date !== saved.date)] });
    }
    case "profileSaved": {
      if (model.pending?.kind !== "saveProfile" || model.pending.id !== proposal.id) return model;
      if (!proposal.result.ok) return { ...model, pending: undefined, syncError: proposal.result.error.message,
        profileUi: { ...model.profileUi, requestedSave: true } };
      const completedNow = !model.profile.profile.completed && proposal.result.value.profile.completed;
      const updated = { ...model, pending: undefined, profile: proposal.result.value,
        profileUi: initialProfileUi(proposal.result.value.profile), message: "Saved to your account." };
      return completedNow ? schedule(updated, { kind: "load" }) : continueSync(updated);
    }
    case "syncFailed": return model.pending?.id === proposal.id ? { ...model, pending: undefined, syncError: "Your changes could not be saved. Try again.",
      profileUi: model.pending.kind === "saveProfile" ? { ...model.profileUi, requestedSave: true } : model.profileUi } : model;
    default: {
      // Account state may update while loading; the scorecard itself cannot be edited until loaded.
      if (!model.loaded && proposal.kind !== "accountChanged") return model;
      const changed = acceptLocal(model, proposal);
      return continueSync(changed.day !== model.day ? { ...changed, generation: model.generation + 1 } : changed);
    }
  }
}

export function representScorecard(model: ScorecardModel) {
  const profile = model.profile.profile;
  const dated = [...model.history.filter(day => day.date !== model.date), { date: model.date, scorecard: model.day, revision: model.dayRevision }].sort((a, b) => a.date.localeCompare(b.date));
  const weightDays = dated.filter(day => day.scorecard.values.weight !== undefined);
  const series = weightDays.map(day => ({ date: day.date, weight: day.scorecard.values.weight ?? 0 }));
  const samples = profile.startingWeight !== undefined && !series.some(day => day.date === profile.startDate)
    ? [{ date: profile.startDate, weight: profile.startingWeight }, ...series].sort((a, b) => a.date.localeCompare(b.date)) : series;
  const weights = samples.map(day => day.weight);
  const startWeight = profile.startingWeight ?? weights[0] ?? 0;
  const min = Math.min(...weights), max = Math.max(...weights), range = max - min || 1;
  const first = samples[0], last = samples.at(-1);
  const timeRange = first && last ? Date.parse(last.date) - Date.parse(first.date) || 1 : 1;
  const points = samples.map(day => `${((Date.parse(day.date) - Date.parse(first?.date ?? day.date)) / timeRange * 310).toFixed(1)},${((max - day.weight) / range * 70 + 5).toFixed(1)}`).join(" ");
  const programDayFor = (date: string | undefined) => Math.max(1, Math.round((Date.parse(date ?? profile.startDate) - Date.parse(profile.startDate)) / 86400000) + 1);
  const difference = startWeight - (model.day.values.weight ?? startWeight);
  const history = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${model.date || profile.startDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - (6 - i));
    const key = date.toISOString().slice(0, 10), day = dated.find(item => item.date === key)?.scorecard;
    const v = day?.values;
    return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()] ?? "", date: key,
      nutrition: v ? [v.energy, v.protein, v.water].filter(value => value !== undefined).length : 0,
      activity: v ? [v.sleep !== undefined, day?.checks.training, v.steps !== undefined].filter(Boolean).length : 0,
      mindset: day ? [day.checks.map, !!day.brainDump.trim() && day.goals.length > 0, day.checks.focus].filter(Boolean).length : 0 };
  });
  let streak = 0;
  for (let i = dated.length - 1; i >= 0; i--) {
    const day = dated[i]; if (!day || (!Object.values(day.scorecard.values).some(v => v !== undefined) && !Object.values(day.scorecard.checks).some(Boolean) && !day.scorecard.brainDump && !day.scorecard.goals.length)) continue;
    const date = new Date(`${model.date || profile.startDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - streak);
    if (day.date !== date.toISOString().slice(0, 10)) break;
    streak++;
  }
  const programDay = Math.max(1, Math.round((Date.parse(model.date || profile.startDate) - Date.parse(profile.startDate)) / 86400000) + 1);
  const tracked = history.reduce((sum, day) => sum + day.nutrition + day.activity + day.mindset, 0);
  return { ...model, ...representDay(model.day, profile.targets), weightDelta: Math.abs(difference).toFixed(1), weightDown: difference >= 0,
    trendPoints: points, hasWeightData: weights.length > 0, hasWeightTrend: weights.length > 1,
    trendStartDay: programDayFor(first?.date), trendEndDay: programDayFor(last?.date), trendStartWeight: first?.weight, trendEndWeight: last?.weight, trackedEntries: tracked, consistencyTotal: 63, consistency: Math.round(tracked / 63 * 100), startWeight, programDay, streak, trackingHistory: history,
    rolloverNotice: !!model.observedDate && model.observedDate !== model.date,
    saving: model.pending?.kind === "saveDay" || model.pending?.kind === "saveProfile", targets: profile.targets } as const;
}

export type ScorecardState = ReturnType<typeof representScorecard>;
export function hasUnsavedScorecard(model: ScorecardModel): boolean {
  const draft = { ...model.profileUi.draft, setupStep: model.profile.profile.setupStep };
  return model.generation > model.savedGeneration || model.profileUi.requestedSave || model.pending?.kind === "saveProfile" || !!model.goalDraft.trim()
    || JSON.stringify(draft) !== JSON.stringify(model.profile.profile)
    || Object.entries(model.profileUi.targetDrafts).some(([key, value]) => value !== String(model.profile.profile.targets[key as keyof typeof model.profile.profile.targets]))
    || Object.entries(model.drafts).some(([key, value]) => value !== String(model.day.values[key as Metric] ?? ""));
}
export function nextScorecardAction(model: ScorecardModel) {
  return model.panel ? { kind: "showPanel", panel: model.panel } as const : { kind: "closePanel" } as const;
}
export function nextScorecardNetworkAction(model: ScorecardModel): SyncEffect | undefined { return model.pending?.kind === "load" || model.pending?.kind === "saveDay" || model.pending?.kind === "saveProfile" ? model.pending : undefined; }
export function nextScorecardEffect(model: ScorecardModel): ScorecardEffect | undefined { return model.pending; }
