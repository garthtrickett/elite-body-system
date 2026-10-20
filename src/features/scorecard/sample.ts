import type { Scorecard } from "./operations.ts";

export const SAMPLE = {
  day: 12, streak: 12, startWeight: 79.6,
  weights: [79.6, 79.4, 79.2, 79.0, 78.8, 78.6, 78.4, 78.2, 78.0, 77.8, 77.6],
  // Three tracked boxes per pillar per day. Consistency measures tracking, not hitting targets.
  history: [
    { day: "Tue", nutrition: 3, activity: 3, mindset: 2 },
    { day: "Wed", nutrition: 3, activity: 2, mindset: 3 },
    { day: "Thu", nutrition: 2, activity: 3, mindset: 3 },
    { day: "Fri", nutrition: 3, activity: 3, mindset: 3 },
    { day: "Sat", nutrition: 2, activity: 2, mindset: 2 },
    { day: "Sun", nutrition: 3, activity: 3, mindset: 3 },
    { day: "Mon", nutrition: 3, activity: 3, mindset: 3 },
  ],
  map: [
    { title: "Who I am", text: "I’m becoming someone who trains like it’s already decided, not negotiated." },
    { title: "The future I’m building", text: "I have the energy to lead at work and be present at home." },
    { title: "The future I refuse", text: "Another year of putting my health last." },
    { title: "Signs it’s working", text: "I keep my promises to myself. Training becomes part of my day." },
    { title: "Where this leads", text: "The standard I set here carries into everything else." },
    { title: "Final statement", text: "One card. Three pillars. Every day." },
  ],
  exercises: [
    { name: "Dumbbell Shoulder Press", detail: "3 × 10 · Straight Set" },
    { name: "Lateral Raise", detail: "3 × 15 · Straight Set" },
    { name: "Cable Curl", detail: "3 × 12 · Super Set A" },
    { name: "Rope Pushdown", detail: "3 × 12 · Super Set A" },
    { name: "Rear Delt Fly", detail: "3 × 15 · Straight Set" },
  ],
} as const;

export function sampleScorecard(): Scorecard {
  return { values: { weight: 77.5, energy: undefined, protein: undefined, water: undefined, sleep: undefined, steps: undefined },
    checks: { training: false, map: false, focus: false }, brainDump: "", goals: [] };
}
