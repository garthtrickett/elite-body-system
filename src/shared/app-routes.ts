export const APP_ROUTES = {
  "/": { page: "scorecard", title: "Scorecard" },
  "/training": { page: "training", title: "Training" },
  "/meals": { page: "meals", title: "Meals" },
  "/mindset/map": { page: "map", title: "Neural Map" },
  "/courses/mindset": { page: "mindset", title: "Mindset" },
  "/courses/nutrition": { page: "nutrition", title: "Nutrition" },
  "/courses/activity": { page: "activity", title: "Activity" },
  "/onboarding": { page: "onboarding", title: "Day 1 setup" },
} as const;
export type AppPage = (typeof APP_ROUTES)[keyof typeof APP_ROUTES]["page"];
export function appRoute(path: string) { return Object.entries(APP_ROUTES).find(([key]) => key === path)?.[1]; }
