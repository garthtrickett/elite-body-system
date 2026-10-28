import { Migrator } from "kysely";
import type { Kysely } from "kysely";
import * as auth from "./migrations/001_auth.ts";
import * as clients from "./migrations/002_client_profiles.ts";
import * as training from "./migrations/003_training.ts";
import * as learning from "./migrations/004_learning.ts";
import * as meals from "./migrations/005_meals.ts";
import * as onboarding from "./migrations/006_onboarding.ts";
import * as marketing from "./migrations/007_marketing_permissions.ts";
import * as stories from "./migrations/008_marketing_stories.ts";
import * as checkins from "./migrations/009_weekly_checkins.ts";
import * as mentorCheckins from "./migrations/010_mentor_checkin_reviews.ts";

import * as sales from "./migrations/011_sales_management.ts";

import * as marketingDelivery from "./migrations/012_marketing_delivery.ts";

import * as coachingMemberships from "./migrations/013_coaching_memberships.ts";

export async function migrate<DB>(db: Kysely<DB>): Promise<void> {
  const outcome = await new Migrator({ db, provider: {
      getMigrations: async () => ({ "001_auth": auth, "002_client_profiles": clients, "003_training": training, "004_learning": learning, "005_meals": meals, "006_onboarding": onboarding, "007_marketing_permissions": marketing, "008_marketing_stories": stories, "009_weekly_checkins": checkins, "010_mentor_checkin_reviews": mentorCheckins, "011_sales_management": sales, "012_marketing_delivery": marketingDelivery, "013_coaching_memberships": coachingMemberships }),
  } }).migrateToLatest();
  if (outcome.error) throw outcome.error;
}
