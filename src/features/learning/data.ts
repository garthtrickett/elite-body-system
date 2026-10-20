import { isRecord, isText, isRevision } from "../../shared/validation.ts";
import { MAP_PARTS } from "./map-content.ts";
import type { MapKey } from "./map-content.ts";
import { EPISODES } from "./courses.ts";
import type { Episode } from "./courses.ts";

export type NeuralMap = Readonly<Record<MapKey, string>> & Readonly<{ step: number }>;
export type CourseProgress = Readonly<{ answers: Readonly<Record<string, readonly string[]>>; done: Readonly<Record<string, boolean>> }>;
export type EpisodeStatus = "scheduled" | "blocked" | "open" | "done";
export type LearningSnapshot = Readonly<{
  map: NeuralMap; mapRevision: number; progress: CourseProgress; progressRevision: number;
  week: number; setupComplete: boolean; mapRead: boolean; videoUrls: Readonly<Record<string, string>>;
}>;

export function emptyMap(identity = ""): NeuralMap { return { identity, build: "", refuse: "", signals: "", leads: "", final: "", step: 0 }; }
export function mapWritten(map: NeuralMap): boolean { return MAP_PARTS.every(part => map[part.key].trim()); }
export function parseMap(value: unknown): NeuralMap | undefined {
  if (!isRecord(value) || !MAP_PARTS.every(part => isText(value[part.key], 5000)) || !isRevision(value.step) || value.step > 6) return undefined;
  return { identity: value.identity as string, build: value.build as string, refuse: value.refuse as string, signals: value.signals as string, leads: value.leads as string, final: value.final as string, step: value.step };
}
export function parseProgress(value: unknown): CourseProgress | undefined {
  if (!isRecord(value) || !isRecord(value.answers) || !isRecord(value.done)) return undefined;
  const answers: Record<string, readonly string[]> = {}, done: Record<string, boolean> = {};
  for (const [id, rows] of Object.entries(value.answers)) {
    const episode = EPISODES.find(item => item.id === id);
    if (!episode || !Array.isArray(rows) || rows.length > episode.tasks.length || !rows.every(answer => isText(answer, 5000))) return undefined;
    answers[id] = rows as string[];
  }
  for (const [id, complete] of Object.entries(value.done)) { const episode = EPISODES.find(item => item.id === id); if (!episode || typeof complete !== "boolean" || (complete && (answers[id]?.length !== episode.tasks.length || answers[id]?.some(answer => !answer.trim())))) return undefined; done[id] = complete; }
  return { answers, done };
}
export function episodeStatus(input: Readonly<{ episode: Episode; snapshot: LearningSnapshot }>): EpisodeStatus {
  if (input.snapshot.progress.done[input.episode.id]) return "done";
  if (!input.snapshot.setupComplete) return "blocked";
  if (input.episode.week > input.snapshot.week) return "scheduled";
  return EPISODES.some(episode => episode.week < input.episode.week && !input.snapshot.progress.done[episode.id]) ? "blocked" : "open";
}
export function parseLearningSnapshot(value: unknown): LearningSnapshot | undefined {
  if (!isRecord(value) || !isRevision(value.mapRevision) || !isRevision(value.progressRevision) || !isRevision(value.week) || value.week < 1 || typeof value.setupComplete !== "boolean" || typeof value.mapRead !== "boolean" || !isRecord(value.videoUrls)) return undefined;
  const map = parseMap(value.map), progress = parseProgress(value.progress), videoUrls: Record<string, string> = {};
  if (!map || !progress) return undefined;
  for (const [key, url] of Object.entries(value.videoUrls)) {
    if (typeof url !== "string") return undefined;
    try { if (new URL(url).protocol !== "https:") return undefined; } catch { return undefined; }
    videoUrls[key] = url;
  }
  return { map, progress, mapRevision: value.mapRevision, progressRevision: value.progressRevision, week: value.week, setupComplete: value.setupComplete, mapRead: value.mapRead, videoUrls };
}
