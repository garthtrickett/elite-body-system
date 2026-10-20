export const SETUP_STEPS = ["welcome", "next", "name", "age", "role", "business", "travel", "how", "rhythm", "whatsapp", "week", "space", "anchor",
  "storyIntro", "want", "give", "matters", "never", "tried", "stopped", "now", "why", "almost", "source", "safetyIntro", "parq", "parqMore", "emergency", "consent", "scale", "identity", "win", "commit", "done"] as const;
export const STORY_QUESTIONS = {
  age: { question: "How old are you?", choices: ["25–34", "35–44", "45–54", "55+"] },
  role: { question: "What do you do?", choices: ["Founder", "Business owner", "Executive", "Athlete", "Something else"] },
  business: { question: "What’s the business, in a line?", optional: true },
  travel: { question: "How often do you travel?", choices: ["Rarely", "Monthly", "Most weeks", "I live on the move"] },
  want: { question: "In your own words, what do you want from the next 12 weeks?" },
  give: { question: "If you got that, what would it give you?" },
  matters: { question: "And why does that matter to you?" },
  never: { question: "What’s the one thing you never want to go back to?" },
  tried: { question: "What have you tried before?", choices: ["Personal trainer", "Gym on my own", "Online program", "Fitness apps", "Diets", "Classes or bootcamps", "Nothing structured"], multiple: true },
  stopped: { question: "Why didn’t it last?", optional: true },
  now: { question: "What made now the right time?" },
  why: { question: "What made you choose this over other options?" },
  almost: { question: "What nearly stopped you joining?", optional: true },
  source: { question: "How did you find Harry?", choices: ["Instagram", "LinkedIn", "A friend", "Google", "Podcast or event", "Something else"] },
} as const;
export const HEALTH_QUESTIONS = [
  "Has a doctor ever said you have a heart condition or high blood pressure?",
  "Do you feel pain in your chest at rest, during daily activities, or when you’re physically active?",
  "In the past 12 months, have you lost your balance because of dizziness, or lost consciousness?",
  "Have you been diagnosed with any other chronic medical condition?",
  "Are you currently taking prescribed medication for a chronic medical condition?",
  "Have you had a bone, joint or soft tissue problem that could get worse with more activity?",
  "Has a doctor ever said you should only exercise under medical supervision?",
] as const;
export const DRAFT_CONSENT = [
  ["The program", "Resistance training, cardio, mobility, nutrition guidance and daily habit tracking, coached remotely."],
  ["The risks", "Exercise carries risks, including soreness, strains and other injuries. Following technique guidance and rest periods reduces risk but cannot remove it."],
  ["Your responsibilities", "Tell Harry about changes in health, injury or medication. Stop and seek medical advice if you experience chest pain, severe breathlessness, dizziness or sharp pain."],
  ["Your choice", "Participation is voluntary. You can pause or stop. Coaching is not medical treatment."],
] as const;
