# Elite Delivery

## Entry points

- `/manage/system`: EBS Master, with Mentor and Member views beneath Delivery.
- `/mentor`: the standalone EBS Mentor Portal for provisioned coaches.
- `/`: the existing EBS Member Portal, with training, meals, mindset and onboarding.
- `/messages` and `/community`: member coaching conversations and group community.

## Team workflow

1. Open Clients and find a member by name or email.
2. Open their starting point. Review their goals, equipment, reported constraints
   and check-ins before programming.
3. After confirmed enrolment, a business manager can assign Group & community or
   Individual access. Add a confirmed member creates their account and access;
   it does not take payment or send an invitation. Existing memberships are kept.
4. Use Messages for individual-access conversations. Group and individual members
   can use Community. Keep private health information out of community posts.
5. Progress shows submitted check-in graphs and recent logged training. Earlier
   check-in history can be loaded without changing or deleting submissions.
6. Programming records a dated adjustment and client-facing instructions. Choose
   a foundation session to override sets, reps, rest, cardio targets or exercise
   notes. These are real prescriptions used by new workout sessions, not just
   private coach notes. The effective date uses the client's time zone.
7. Logged sessions retain their original prescription. New adjustments do not
   rewrite previous workouts. The foundation exercise catalogue remains the
   available set of movements; creating entirely new exercises is outside this build.
8. Check-ins opens the existing review queue. Reviewing removes an item from the
   queue while preserving the client's submission and review receipt.

Messages support text and HTTPS links, including externally hosted training videos.
No external WhatsApp, email notification or conferencing service is sent by this
workspace. Uncertain sends retry the same request ID, so they do not create a new
message. Read receipts are per coach/member and conversation.

## Access

Mentors retain explicit selected-client assignments by default. Trusted admin can
set an existing mentor's scope to all clients:

```sh
npm run mentor:admin -- scope COACH_EMAIL all
```

`management:admin master OWNER_EMAIL` grants business management and all-client
mentor access together. The production owner email is still outstanding. Direct
username sign-in to the synthetic preview never grants production access.

Only business managers with mentor access can assign memberships or add accounts.
An active Group membership enables community participation. An active Individual
membership additionally enables direct coaching messages. Earlier direct messages
remain in the client's account when their access changes. Current medical/setup
requirements still apply to training and normal member workflows.

The isolated Harry preview has a synthetic Individual membership so both sides can
be inspected. It does not represent a real purchase, payment or medical clearance.
