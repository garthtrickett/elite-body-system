export const WEEKLY_COACHING = [
  { id: "program", title: "Monday · Program delivery", paragraphs: [
    "Go into the week with a clear plan so you can turn up and focus on your training.",
    "Expect a custom program update every four weeks. At the start of a new program cycle, your plan will be available before 06:00 GMT on Monday.",
  ] },
  { id: "feedback", title: "Coaching feedback", paragraphs: [
    "We’ll review your workouts, including what feels comfortable and what doesn’t, to refine your technique around your anatomy and goals.",
    "Feedback helps you train smarter, move more effectively and get more from each session. You’ll build confidence in what you’re doing and understand why you’re doing it.",
    "Record key exercises as you train and send your best sets so your coach can identify where small changes could improve your movement.",
  ] },
  { id: "filming", title: "What to film", paragraphs: [
    "Film up to three exercises per workout. This keeps feedback focused and gives you clear changes to put into practice.",
    "Send videos of personal-best attempts too, so we can track and celebrate your progress.",
    "Place your phone securely against a water bottle or use a tripod. Keep yourself centred, with the whole movement and any equipment clearly in frame.",
  ] },
  { id: "check-in", title: "Saturday · Weekly check-in", paragraphs: [
    "Your weekly check-in is a chance to reflect on your training, progress and overall wellbeing. Share what is working, what feels difficult and anything that may affect the week ahead.",
    "This gives your coach the information needed to provide targeted feedback, adjust your approach and support consistent progress.",
    "Complete your check-in by Sunday evening at the latest. Stay involved and make full use of the support available to you.",
  ] },
  { id: "communication", title: "Communication", paragraphs: [
    "Coaching communication takes place through WhatsApp. Send questions, updates, videos or voice notes whenever you need to.",
    "Your coach replies within 48 hours during coaching hours: Monday to Friday, 09:00–17:00 GMT. Messages and check-ins sent over the weekend are answered on Monday.",
    "Keep your coach updated, ask questions and share your training videos. The more useful information you provide, the more specific and effective your support can be.",
  ] },
] as const;

export const WEEKLY_INTRODUCTION = "Your Elite Body System weekly rhythm. Follow these steps each week to train with a clear plan, get useful feedback and keep making progress.";
export const COACHING_COMMUNICATION = WEEKLY_COACHING.find(section => section.id === "communication")!.paragraphs.join("\n\n");
export const COACHING_TECHNIQUE = WEEKLY_COACHING.filter(section => section.id === "feedback" || section.id === "filming").map(section => section.paragraphs.join("\n\n")).join("\n\n");
export const COACHING_RHYTHM = [WEEKLY_INTRODUCTION, ...WEEKLY_COACHING.map(section => `${section.title}\n${section.paragraphs.join("\n\n")}`)].join("\n\n");
