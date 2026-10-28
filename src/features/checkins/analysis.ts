import { EFFECTIVENESS, FUNDAMENTALS, SCORES } from "./data.ts";
import type { Answers, Entry, Score } from "./data.ts";

export function scoreAverage(answers: Answers, keys: readonly Score[]): number | null {
  const values = keys.map(key => answers.scores[key]).filter((value): value is number => value !== null);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
}
export const fundamentalAverage = (entry: Entry) => scoreAverage(entry.answers, Object.keys(FUNDAMENTALS) as Score[]);
export const effectivenessAverage = (entry: Entry) => scoreAverage(entry.answers, Object.keys(EFFECTIVENESS) as Score[]);
export type Attention = Readonly<{ title: string; detail: string; level: "attention" | "watch" | "info" }>;
export function attention(entries: readonly Entry[]): readonly Attention[] {
  const latest = entries[0], previous = entries[1];
  if (!latest) return [];
  const items: Attention[] = [];
  for (const key of Object.keys(SCORES) as Score[]) {
    const value = latest.answers.scores[key], prior = previous?.answers.scores[key];
    if (value === null) continue;
    if (value <= 6) items.push({ title: `${SCORES[key]} ${value}/10`, detail: prior !== null && prior !== undefined && prior <= 6 ? "Second check-in in a row at 6 or below." : "Worth discussing with your coach.", level: value <= 5 ? "attention" : "watch" });
    else if (prior !== undefined && prior !== null && prior - value >= 2) items.push({ title: `${SCORES[key]} down ${prior - value}`, detail: `${prior} at the previous check-in, ${value} now.`, level: "watch" });
  }
  const fundamentals = fundamentalAverage(latest), effectiveness = effectivenessAverage(latest);
  if (fundamentals !== null && effectiveness !== null && fundamentals >= 7.5 && effectiveness <= 6.5) items.push({ title: "Doing the work, not feeling effective", detail: "Discuss recovery, nutrition and mindset with your coach before changing the plan.", level: "watch" });
  const weights = entries.filter(entry => entry.answers.data.weight !== null);
  if (weights.length >= 2) {
    const change = weights[0]!.answers.data.weight! - weights[1]!.answers.data.weight!;
    if (Math.abs(change) >= 1.5) items.push({ title: `Weight ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} kg`, detail: "Use consistent measuring conditions and compare the longer trend.", level: "watch" });
  }
  const waists = entries.filter(entry => entry.answers.data.waist !== null);
  if (waists.length >= 3) {
    const change = waists[0]!.answers.data.waist! - waists[2]!.answers.data.waist!;
    if (change >= 1) items.push({ title: `Waist up ${change.toFixed(1)} cm over two check-ins`, detail: "Compare with your goals and discuss with your coach before changing anything.", level: "watch" });
  }
  if (entries.length === 1) items.push({ title: "Comparisons start next check-in", detail: "Changes and trends need at least two check-ins.", level: "info" });
  return items;
}
