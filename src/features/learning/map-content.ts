export type MapKey = "identity" | "build" | "refuse" | "signals" | "leads" | "final";
export type MapPart = Readonly<{ key: MapKey; num: string; title: string; hint: string }>;
export type MapStep = Readonly<{ title: string; lead: string; intro?: boolean; part?: string; keys?: readonly MapKey[];
  network?: string; why?: readonly string[]; how?: readonly string[]; src: string; oneLiner?: string;
  history?: readonly Readonly<{ was: string; now: string; src: string }>[];
  networks?: readonly Readonly<{ name: string; job: string; alone: string; withMap: string; src: string }>[];
  apart?: string; together?: string; feeling?: Readonly<{ title: string; text: readonly string[]; line: string; src: string }>;
}>;
export const MAP_PARTS: readonly MapPart[] = [
  {
    "key": "identity",
    "num": "01",
    "title": "Who I am",
    "hint": "Write it as an instruction. Present tense. Who you are becoming, as if already true."
  },
  {
    "key": "build",
    "num": "02",
    "title": "The future I’m building",
    "hint": "The life this leads to. Specific. What you see, feel, do."
  },
  {
    "key": "refuse",
    "num": "02",
    "title": "The future I refuse",
    "hint": "Where the old path ends. Be honest. This is the part your survival brain listens to."
  },
  {
    "key": "signals",
    "num": "03",
    "title": "Signs it’s working",
    "hint": "What you’ll notice: cravings losing their pull, training you look forward to, food that fuels you."
  },
  {
    "key": "leads",
    "num": "04",
    "title": "Where this leads",
    "hint": "Across your whole life: the discipline, the agency, the standard you carry into business and home."
  },
  {
    "key": "final",
    "num": "05",
    "title": "Final statement",
    "hint": "One line. The sentence you’d want to read on the hardest morning."
  }
];

export const MAP_STEPS: readonly MapStep[] = [
  {
    "intro": true,
    "title": "Build your Neural Map",
    "lead": "Five short parts. About 20 minutes. Written once, read every morning.",
    "history": [
      {
        "was": "Left brain vs right brain",
        "now": "A study of over 1,000 brain scans found no evidence that people are “left-brained” or “right-brained.” Both sides work together.",
        "src": "Nielsen et al. (2013), PLOS ONE"
      },
      {
        "was": "Lizard, mammal and human brain",
        "now": "The idea of a reptilian core wrapped in newer layers came from the 1960s triune brain model. Comparative neuroscience has since rejected it: brain regions evolved together, not stacked on top of each other.",
        "src": "Cesario, Johnson & Eisthen (2020), Current Directions in Psychological Science"
      },
      {
        "was": "Now: networks",
        "now": "The modern view is large-scale networks: regions across the brain that fire together to do a job. And connections that are used repeatedly get stronger. That’s the core of neuroplasticity.",
        "src": "Menon (2011); Hebb (1949), The Organization of Behavior"
      }
    ],
    "oneLiner": "It’s not left brain versus right brain, and there’s no lizard brain. It’s networks, and networks get stronger the more consistently you use them.",
    "why": [],
    "src": ""
  },
  {
    "intro": true,
    "title": "Your three networks",
    "lead": "What each one does, what happens when it’s left to run on its own, and what changes with a Map.",
    "networks": [
      {
        "name": "Default mode network",
        "job": "Your inner narrator. It runs self-talk, replays the past and imagines the future, mostly when you’re not focused on a task.",
        "alone": "It rehearses whatever story is most familiar, usually the old one. One large study found people’s minds wander for almost half their waking hours, and they were less happy while it did.",
        "withMap": "The story it rehearses is the one you wrote. Self-talk starts pointing at who you’re becoming, not who you were.",
        "src": "Killingsworth & Gilbert (2010), Science"
      },
      {
        "name": "Salience network",
        "job": "Your filter. It decides what matters right now and switches you between thinking and doing. It runs on feeling, not reasoning: its hub, the anterior insula, reads your body’s signals and emotional weight to decide what gets flagged.",
        "alone": "It’s tuned by habit and quick rewards. The phone, the craving, the easy option feel important in the moment, so they win. A goal that’s only logical barely registers.",
        "withMap": "You’ve given it something to feel: the future you want, the one you refuse, the signs it’s working. Written with real feeling, those start standing out. Written as plain facts, they won’t.",
        "src": "Menon & Uddin (2010), Brain Structure and Function"
      },
      {
        "name": "Central executive network",
        "job": "Your planner. It holds goals in mind, weighs options and keeps you on the plan.",
        "alone": "It has limited capacity, and stress and fatigue weaken it. On a heavy business day, work takes all of it and health drops out first.",
        "withMap": "The decision is already made and written down. Less to hold, less to negotiate. It only has to follow through.",
        "src": "Arnsten (2009), Nature Reviews Neuroscience"
      }
    ],
    "apart": "Your networks work as a team, taking turns: the salience network switches you between the narrator and the planner many times a day. The problem is what each one is working from. Without a Map, each runs on its default: the planner on last night’s plan, the narrator on the old story, the filter on whatever feels good right now. So the plan rarely survives the moment, and most people blame willpower.",
    "together": "With a Map, all three run on the same instruction and fire with congruency. The narrator rehearses who you’re becoming. The filter flags what moves you towards it. The planner already knows the move. The choice you wanted to make becomes the natural one, because every network is working towards the life you want and away from the one you don’t.",
    "feeling": {
      "title": "Why it has to be personal",
      "text": [
        "Feeling isn’t the opposite of good decisions. It’s how the brain assigns value. In a landmark study, people with damage to emotion-processing areas of the brain made worse decisions, not better ones, because they couldn’t feel which option mattered.",
        "So a Map written as targets (“lose 8kg, train four times a week”) gives your salience network nothing to flag. A Map written from what genuinely moves you, the people, the moments, the version of you that you’re not willing to become, does. Generic won’t work. Borrowed words won’t work. It has to be yours."
      ],
      "line": "Logic sets the plan. Feeling decides what you notice. The Map needs both.",
      "src": "Bechara, Damasio, Tranel & Damasio (1997), Science; Damasio (1994), Descartes’ Error."
    },
    "why": [
      "Repetition is what makes it stick. In one study of new daily habits, behaviours took a median of 66 days to become automatic, with a wide range from 18 to 254 days.",
      "Linking the three networks through one daily read is applied reasoning from the science, not a clinical protocol. Each part that follows is built on its own body of research, named as you go."
    ],
    "src": "Menon (2011), Trends in Cognitive Sciences; Lally et al. (2010), European Journal of Social Psychology."
  },
  {
    "part": "01",
    "title": "Who I am",
    "keys": [
      "identity"
    ],
    "network": "Default mode network",
    "lead": "The identity your brain defaults to when you’re not trying.",
    "why": [
      "When you’re not focused on a task, the default mode network runs self-referential thought: the ongoing story of who you are. Research on identity-based motivation finds people act in line with whichever identity feels active in the moment, and quietly drop behaviours that feel “not like me.”",
      "Believability matters. In one study, repeating positive self-statements that people didn’t believe made those with low self-esteem feel worse. So write a stretch, not a fantasy."
    ],
    "how": [
      "Write it so it means something to you. If it could be anyone’s, it isn’t finished.",
      "Present tense, stated as fact.",
      "Behaviours over adjectives: “I train four days a week” beats “I’m disciplined.”",
      "Believable today, even if you’re not fully there yet."
    ],
    "src": "Oyserman, identity-based motivation research; Wood, Perunovic & Lee (2009), Psychological Science."
  },
  {
    "part": "02",
    "title": "Two futures",
    "keys": [
      "build",
      "refuse"
    ],
    "network": "Default mode + salience networks",
    "lead": "Where this leads, and where the old path ends.",
    "why": [
      "Imagining the future is default mode network work, but positive fantasy on its own can backfire. In Oettingen’s studies, people who fantasised most positively about weight loss lost less weight. The approach that holds up is mental contrasting: a vivid desired future set against an honest look at what stands in the way.",
      "Losses also tend to weigh more heavily than equivalent gains. An honest picture of where the current path leads gives your salience network a reason to flag old habits as a threat, not a treat."
    ],
    "how": [
      "The future you’re building: specific, about 12 months out. Who’s there, what you see, how it feels in your body.",
      "The future you refuse: honest, not catastrophic. Where your old pattern realistically ends, and what it would cost the people you care about.",
      "Name the moment you usually break. That’s the obstacle to plan around.",
      "Test it: read it back. If you feel nothing, it’s not specific or personal enough yet."
    ],
    "src": "Oettingen & Mayer (2002), JPSP; Oettingen, mental contrasting research; Kahneman & Tversky (1979), prospect theory."
  },
  {
    "part": "03",
    "title": "Signs it’s working",
    "keys": [
      "signals"
    ],
    "network": "Salience network",
    "lead": "Teach your brain what to notice.",
    "why": [
      "Dopamine neurons respond most strongly when things go better than expected, known as reward prediction error. Progress you notice registers as reward. Progress you don’t notice doesn’t.",
      "Your salience network decides what gets noticed. Writing down specific early signals points your attention at them, so the process itself becomes rewarding, not just the end result. Workplace research finds the same: noticed small wins are among the strongest drivers of motivation."
    ],
    "how": [
      "Early and frequent, not end goals: energy at 3pm, a craving that passes, a better night’s sleep.",
      "Include what you’ll feel, not only what you’ll measure. Feeling is what your salience network responds to.",
      "Include signs that training and food have become the part you look forward to."
    ],
    "src": "Schultz, Dayan & Montague (1997), Science; Amabile & Kramer (2011), The Progress Principle."
  },
  {
    "part": "04",
    "title": "Where this leads",
    "keys": [
      "leads"
    ],
    "network": "Central executive network",
    "lead": "Connect your body to the rest of your life.",
    "why": [
      "Goals held for your own reasons last. Across exercise studies, motivation that comes from personal values and meaning predicts long-term adherence far better than pressure or guilt.",
      "Reflecting on your core values also reduces defensiveness and helps people persist when things get hard. Tying training to the business, the family and the standard you hold gives your central executive network a reason to protect it on a busy week."
    ],
    "how": [
      "What the discipline makes possible in business, at home, in how you lead.",
      "The standard you want to carry into every room.",
      "Why this matters to you, not what you think you should say.",
      "Name the people it’s for."
    ],
    "src": "Teixeira et al. (2012), International Journal of Behavioral Nutrition and Physical Activity; Cohen & Sherman (2014), Annual Review of Psychology."
  },
  {
    "part": "05",
    "title": "Final statement",
    "keys": [
      "final"
    ],
    "network": "All three, under pressure",
    "lead": "One line for the hardest morning.",
    "why": [
      "Stress and fatigue weaken the prefrontal cortex, the region behind planning and working memory. On a bad day a long plan is hard to reach. A single line isn’t.",
      "Pre-deciding also works. “If-then” plans (“when X happens, I do Y”) make the response more automatic. A meta-analysis of 94 studies found a medium-to-large effect on reaching goals."
    ],
    "how": [
      "One sentence, in your own words, readable in three seconds.",
      "It should land in your chest, not just make sense.",
      "Optionally an if-then: “When I want to skip, I start anyway.”"
    ],
    "src": "Arnsten (2009), Nature Reviews Neuroscience; Gollwitzer & Sheeran (2006), Advances in Experimental Social Psychology."
  }
];
