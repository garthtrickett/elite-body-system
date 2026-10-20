export type Exercise = Readonly<{
  id: string; name: string; muscle: string; type: string; sets?: number; reps?: string; rest?: number;
  role?: string; load?: string; group?: string; bw?: boolean; cardio?: boolean; target?: number;
  note?: string; info?: string; checklist?: readonly string[]; alt?: Readonly<{ id: string; name: string }>;
}>;
export type TrainingDay = Readonly<{ day: string; name: string; owns?: string; rest?: boolean; blocks?: readonly Readonly<{ title: string; note: string }>[] }>;
export type Instructions = Readonly<{ start: string; move: string; ret: string; tips: string }>;

export const PROGRAM: Readonly<Record<number, readonly Exercise[]>> = {
  "1": [
    {
      "id": "wpullup",
      "name": "Weighted Pull-up",
      "muscle": "Back",
      "type": "Straight Set",
      "sets": 4,
      "reps": "5",
      "rest": 300,
      "role": "own",
      "load": "kg added",
      "alt": {
        "id": "latpd",
        "name": "Lat Pulldown"
      }
    },
    {
      "id": "wdip",
      "name": "Weighted Dip",
      "muscle": "Chest · Triceps",
      "type": "Straight Set",
      "sets": 4,
      "reps": "5",
      "rest": 300,
      "role": "own",
      "load": "kg added",
      "alt": {
        "id": "bench",
        "name": "Barbell Bench Press"
      }
    },
    {
      "id": "bbrow",
      "name": "Barbell Row",
      "muscle": "Back",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "8",
      "rest": 0,
      "role": "capped",
      "alt": {
        "id": "lawnrow",
        "name": "Lawn Mower Row"
      }
    },
    {
      "id": "incdb",
      "name": "Incline Dumbbell Press",
      "muscle": "Chest",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "10",
      "rest": 120,
      "role": "capped",
      "alt": {
        "id": "incpush",
        "name": "Incline Push-up"
      }
    },
    {
      "id": "pushemom",
      "name": "Push-up",
      "muscle": "Chest",
      "type": "EMOM",
      "sets": 5,
      "reps": "10",
      "rest": 60,
      "role": "endurance",
      "bw": true,
      "info": "Every minute on the minute: 10 reps, rest the remainder. 5 rounds."
    }
  ],
  "2": [
    {
      "id": "dbpress",
      "name": "Dumbbell Shoulder Press",
      "muscle": "Shoulders",
      "type": "Straight Set",
      "sets": 3,
      "reps": "10",
      "rest": 90,
      "role": "own",
      "alt": {
        "id": "landpress",
        "name": "Landmine Press"
      }
    },
    {
      "id": "lateral",
      "name": "Lateral Raise",
      "muscle": "Shoulders",
      "type": "Straight Set",
      "sets": 3,
      "reps": "15",
      "rest": 60,
      "role": "own",
      "alt": {
        "id": "cablelat",
        "name": "Cable Lateral Raise"
      }
    },
    {
      "id": "curl",
      "name": "Cable Curl",
      "muscle": "Biceps",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "12",
      "rest": 0,
      "role": "own",
      "alt": {
        "id": "dbcurl",
        "name": "Dumbbell Curl"
      }
    },
    {
      "id": "pushdown",
      "name": "Rope Pushdown",
      "muscle": "Triceps",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "12",
      "rest": 75,
      "role": "own",
      "alt": {
        "id": "ohext",
        "name": "Overhead Extension"
      }
    },
    {
      "id": "reardelt",
      "name": "Rear Delt Fly",
      "muscle": "Rear Delts",
      "type": "Straight Set",
      "sets": 3,
      "reps": "15",
      "rest": 60,
      "role": "own",
      "alt": {
        "id": "facepull",
        "name": "Face Pull"
      }
    }
  ],
  "3": [
    {
      "id": "steady",
      "name": "Steady Cardio",
      "muscle": "Conditioning",
      "type": "Steady State",
      "cardio": true,
      "target": 30,
      "note": "Conversational pace"
    },
    {
      "id": "upmob",
      "name": "Upper Mobility",
      "muscle": "Shoulders · Spine",
      "type": "Mobility",
      "checklist": [
        "Thoracic rotations",
        "Shoulder CARs",
        "Wrist prep",
        "Dead hang"
      ]
    }
  ],
  "4": [
    {
      "id": "squat",
      "name": "Back Squat",
      "muscle": "Legs",
      "type": "Straight Set",
      "sets": 4,
      "reps": "5",
      "rest": 300,
      "role": "own",
      "alt": {
        "id": "goblet",
        "name": "Goblet Squat"
      }
    },
    {
      "id": "rdl",
      "name": "Romanian Deadlift",
      "muscle": "Hamstrings · Glutes",
      "type": "Eccentric Set",
      "sets": 3,
      "reps": "8",
      "rest": 150,
      "role": "capped",
      "info": "Three seconds on the way down, controlled. Stop two reps short.",
      "alt": {
        "id": "dbrdl",
        "name": "Dumbbell RDL"
      }
    },
    {
      "id": "lunge",
      "name": "Walking Lunge",
      "muscle": "Quads · Glutes",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "10 / leg",
      "rest": 0,
      "role": "capped",
      "alt": {
        "id": "splitsq",
        "name": "Split Squat"
      }
    },
    {
      "id": "legcurl",
      "name": "Leg Curl",
      "muscle": "Hamstrings",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "12",
      "rest": 90,
      "role": "capped",
      "alt": {
        "id": "nordic",
        "name": "Nordic Curl"
      }
    },
    {
      "id": "calf",
      "name": "Calf Raise",
      "muscle": "Calves",
      "type": "Straight Set",
      "sets": 3,
      "reps": "15",
      "rest": 60,
      "role": "capped"
    }
  ],
  "5": [
    {
      "id": "pullup",
      "name": "Pull-up",
      "muscle": "Back",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "8",
      "rest": 0,
      "role": "capped",
      "bw": true,
      "alt": {
        "id": "latpd",
        "name": "Lat Pulldown"
      }
    },
    {
      "id": "dip",
      "name": "Dip",
      "muscle": "Chest · Triceps",
      "type": "Super Set",
      "group": "A",
      "sets": 3,
      "reps": "10",
      "rest": 120,
      "role": "capped",
      "bw": true,
      "alt": {
        "id": "pushup",
        "name": "Push-up"
      }
    },
    {
      "id": "lateral",
      "name": "Lateral Raise",
      "muscle": "Shoulders",
      "type": "Straight Set",
      "sets": 3,
      "reps": "15",
      "rest": 60,
      "role": "capped"
    },
    {
      "id": "pushemom",
      "name": "Push-up",
      "muscle": "Chest",
      "type": "EMOM",
      "group": "B",
      "sets": 6,
      "reps": "10",
      "rest": 60,
      "role": "own",
      "bw": true,
      "info": "Alternate each minute with pull-ups. 10 reps, rest the remainder."
    },
    {
      "id": "pullemom",
      "name": "Pull-up",
      "muscle": "Back",
      "type": "EMOM",
      "group": "B",
      "sets": 6,
      "reps": "5",
      "rest": 60,
      "role": "own",
      "bw": true
    }
  ],
  "6": [
    {
      "id": "interval",
      "name": "Interval Cardio",
      "muscle": "Conditioning",
      "type": "Intervals",
      "cardio": true,
      "target": 20,
      "note": "Short, sharp, full recovery between"
    },
    {
      "id": "lowmob",
      "name": "Lower Mobility",
      "muscle": "Hips · Ankles",
      "type": "Mobility",
      "checklist": [
        "Hip flexor stretch",
        "Ankle rocks",
        "Hamstring flow",
        "Deep squat hold"
      ]
    }
  ]
};

export const WEEK: Readonly<Record<number, TrainingDay>> = {
  "0": {
    "rest": true,
    "day": "Rest",
    "name": "Rest Day"
  },
  "1": {
    "day": "Day 1",
    "name": "Compound Day",
    "owns": "Primary strength",
    "blocks": [
      {
        "title": "Primary strength",
        "note": "Your best effort today. Full rest between sets."
      },
      {
        "title": "Accessories",
        "note": "Capped. Quality over load."
      },
      {
        "title": "Muscular endurance",
        "note": "Finish strong, not to failure."
      }
    ]
  },
  "2": {
    "day": "Day 2",
    "name": "Isolated Day",
    "owns": "Body composition",
    "blocks": [
      {
        "title": "Body composition isolations",
        "note": "Controlled reps, feel the target muscle."
      },
      {
        "title": "Sport or structural isolations",
        "note": "Bring up what’s lagging."
      }
    ]
  },
  "3": {
    "day": "Recovery",
    "name": "Active Recovery",
    "owns": "Recovery",
    "blocks": [
      {
        "title": "Steady cardio",
        "note": "Conversational pace."
      },
      {
        "title": "Upper mobility",
        "note": "Shoulders, thoracic, wrists."
      }
    ]
  },
  "4": {
    "day": "Day 3",
    "name": "Leg Day",
    "owns": "Leg strength",
    "blocks": [
      {
        "title": "Leg strength",
        "note": "Your best effort today. Full rest between sets."
      },
      {
        "title": "Accessories",
        "note": "Capped. Quality over load."
      }
    ]
  },
  "5": {
    "day": "Day 4",
    "name": "Performance Day",
    "owns": "Muscular endurance",
    "blocks": [
      {
        "title": "Primary strength assistance",
        "note": "Support the main lifts."
      },
      {
        "title": "Body composition isolations",
        "note": "Capped."
      },
      {
        "title": "Muscular endurance",
        "note": "This session owns it. Everything goes here."
      }
    ]
  },
  "6": {
    "day": "Recovery",
    "name": "Active Recovery",
    "owns": "Recovery",
    "blocks": [
      {
        "title": "Interval cardio",
        "note": "Short, sharp, recover fully between."
      },
      {
        "title": "Lower mobility",
        "note": "Hips, ankles, hamstrings."
      }
    ]
  }
};

export const SET_METHODS: Readonly<Record<string, string>> = {
  "Straight Set": "All sets of one exercise, resting fully between each.",
  "Super Set": "Two exercises back to back, then rest.",
  "EMOM": "Every minute on the minute. Finish the reps, rest the rest of the minute.",
  "Eccentric Set": "Slow on the way down. That’s where the work is.",
  "Steady State": "Hold one pace you could talk at.",
  "Intervals": "Work hard, recover fully, repeat.",
  "Mobility": "Slow and controlled. No pain."
};
