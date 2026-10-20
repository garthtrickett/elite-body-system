export type Pillar = "mindset" | "nutrition" | "activity";
export type Episode = Readonly<{ id: string; pillar: Pillar; week: number; title: string; mins: number; desc: string; tasks: readonly string[] }>;
export const EPISODES: readonly Episode[] = [
  {
    "id": "m1",
    "pillar": "mindset",
    "week": 1,
    "title": "The Neural Map",
    "mins": 5,
    "desc": "Why the brain needs clear, written instructions to wire itself for an elite outcome, and how the Map becomes your daily read.",
    "tasks": [
      "Part 1: who are you becoming? Write it as an instruction.",
      "When will you read your Map each day?"
    ]
  },
  {
    "id": "n1",
    "pillar": "nutrition",
    "week": 2,
    "title": "Energy Balance & the Block System",
    "mins": 5,
    "desc": "Why energy balance leads every other principle, and how you build a day from blocks instead of counting everything.",
    "tasks": [
      "Your daily calorie total, and which blocks you’ll build it from.",
      "Write one full day using your blocks."
    ]
  },
  {
    "id": "a1",
    "pillar": "activity",
    "week": 3,
    "title": "The 4-Day Split",
    "mins": 5,
    "desc": "Compound, Isolated, Leg and Performance days, and why they run in that order.",
    "tasks": [
      "Which days of the week are your 4 sessions?",
      "Which 2 days are active recovery?"
    ]
  },
  {
    "id": "m2",
    "pillar": "mindset",
    "week": 4,
    "title": "Identity",
    "mins": 6,
    "desc": "Who you’re becoming, written as behaviour rather than hope.",
    "tasks": [
      "Three things the person you’re becoming does without negotiating.",
      "One old-identity behaviour you’re retiring."
    ]
  },
  {
    "id": "n2",
    "pillar": "nutrition",
    "week": 5,
    "title": "The Protein Rule",
    "mins": 4,
    "desc": "Take the daily total and divide it across three feedings. No per-meal cap myth.",
    "tasks": [
      "Your daily protein total ÷ 3 = grams per feeding.",
      "Which three feedings carry it?"
    ]
  },
  {
    "id": "a2",
    "pillar": "activity",
    "week": 6,
    "title": "The Ownership Rule",
    "mins": 4,
    "desc": "Each session has one quality that gets your best effort. Everything else is capped.",
    "tasks": [
      "What does your next Compound Day own?",
      "What gets capped that day?"
    ]
  },
  {
    "id": "m3",
    "pillar": "mindset",
    "week": 7,
    "title": "Polarising Futures",
    "mins": 5,
    "desc": "Two futures: one you’re excited to build, one you refuse. Both wired in at the level below thought.",
    "tasks": [
      "The future you’re building, in detail.",
      "The future you refuse, in detail."
    ]
  },
  {
    "id": "n3",
    "pillar": "nutrition",
    "week": 8,
    "title": "Digestibility & Fuelling",
    "mins": 5,
    "desc": "Training bloated degrades the session now and compounds over years. Fuel around training on purpose.",
    "tasks": [
      "Foods that leave you bloated or flat in training.",
      "What you’ll eat around training this week."
    ]
  },
  {
    "id": "a3",
    "pillar": "activity",
    "week": 9,
    "title": "Active Recovery",
    "mins": 4,
    "desc": "Why recovery days aren’t rest days: steady and interval cardio, upper and lower mobility.",
    "tasks": [
      "Your cardio choice for steady and interval days.",
      "Your mobility focus for each recovery day."
    ]
  },
  {
    "id": "m4",
    "pillar": "mindset",
    "week": 10,
    "title": "Reading the Signals",
    "mins": 4,
    "desc": "Noticing the reward loop working, so training and nutrition become the part you look forward to.",
    "tasks": [
      "One sign this week that it’s working.",
      "A moment you caught the old identity and corrected it."
    ]
  },
  {
    "id": "n4",
    "pillar": "nutrition",
    "week": 11,
    "title": "Adherence",
    "mins": 5,
    "desc": "The multiplier on everything else. A framework that survives a bad week beats perfect tracking.",
    "tasks": [
      "Your default day when the week goes wrong.",
      "The one rule you won’t break on a bad day."
    ]
  },
  {
    "id": "a4",
    "pillar": "activity",
    "week": 12,
    "title": "Rest Periods",
    "mins": 4,
    "desc": "Why full rest on primary lifts isn’t wasted time.",
    "tasks": [
      "Your main lift, and the rest you’ll take between sets.",
      "What you’ll do during rest instead of your phone."
    ]
  }
];
