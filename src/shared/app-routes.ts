export const APP_ROUTES = {
  "/master": { page: "management", title: "EBS Master" },
  "/manage": { page: "management", title: "Management" },
  "/manage/marketing": { page: "management", title: "Marketing" },
  "/manage/sales": { page: "management", title: "Sales Pipeline" },
  "/manage/system": { page: "management", title: "Elite Body System" },
  "/": { page: "scorecard", title: "Scorecard" },
  "/messages": { page: "messages", title: "Coaching messages" },
  "/community": { page: "community", title: "EBS community" },
  "/training": { page: "training", title: "Training" },
  "/check-in": { page: "checkin", title: "Weekly check-in" },
  "/mentor": { page: "mentor-delivery", title: "EBS Mentor Portal" },
  "/mentor/check-ins": { page: "mentor-checkins", title: "Check-ins · Performance Mentor" },
  "/meals": { page: "meals", title: "Meals" },
  "/mindset/map": { page: "map", title: "Neural Map" },
  "/courses/mindset": { page: "mindset", title: "Mindset" },
  "/courses/nutrition": { page: "nutrition", title: "Nutrition" },
  "/courses/activity": { page: "activity", title: "Activity" },
  "/onboarding": { page: "onboarding", title: "Day 1 setup" },
  "/account/media": { page: "media", title: "Media preferences" },
  "/account/setup": { page: "account-setup", title: "Account setup" },
} as const;
export type AppPage = (typeof APP_ROUTES)[keyof typeof APP_ROUTES]["page"];
export function appRoute(path: string) { return Object.entries(APP_ROUTES).find(([key]) => key === path)?.[1]; }
