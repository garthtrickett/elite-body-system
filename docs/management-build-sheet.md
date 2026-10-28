# EBS management build sheet — 28 October 2026

The user's latest instructions take precedence. Work one task at a time. The
10-hour allowance starts at 15:12 UTC; it is headroom, not a reason to delay.
External requests run sequentially with a target of 80% of known quotas. Do not
invent a provider quota. Honour Retry-After and stop automatic retry loops.

| Order | Task | Status |
| --- | --- | --- |
| 1 | Three portal areas; Member and Mentor portals beneath Delivery | Structure implemented; desktop and phone inspected |
| 2 | harrybaldwin master access | Complete in isolated preview; production verified email is outstanding |
| 3 | Supplied website exactly, with investment question omitting price | Complete; measured desktop sections match the supplied page |
| 4 | Persisted lead journey and manageable sales pipeline | Complete; synthetic application, stage and notes walkthrough succeeded |
| 5 | Branded 30 Days, 30 Insights signup | Complete; 30-day guide, editable content, signup/withdrawal; email delivery remains off |
| 6 | Booking, mentor video and ten FAQs | Complete; booking, calendar and cancellation walkthrough succeeded; video URLs await media |
| 7 | Approved client-story feed after confirmed booking | Complete; draft privacy inspected; actual case-study videos are outstanding |
| 8 | Private, EBS-specific CLOSER call guide | Complete; authenticated guide and absence from public bundle inspected |
| 9 | Member portal preserved; Mentor clients/messages/progress/programming/check-ins | Complete; synthetic exchanges, community, future programming and member provisioning inspected |
| 10 | YouTube topic → experience interview/voice notes → proof → blog/script | Complete; interview, saved drafts and both exports inspected; provider keys absent locally |
| 11 | Simple illustrated Notion formatting and Free Value CTA | Markdown and branded HTML export implemented; direct Notion connection outstanding |
| 12 | Isolated full verification, exact-head CI, merge and Railway release | Build complete; isolated regression verification next |

## Decisions

- Top navigation: Elite Marketing System, Elite Sales System, Elite Delivery.
- Delivery: EBS Member Portal and EBS Mentor Portal.
- This is a group high-ticket transformation system, with £2,400 group/community
  and £5,000 individual access. Explain these options on the call.
- Preserve the uploaded website as supplied. The only requested copy exception is
  that the application investment question does not repeat a price.
- Use the user's design as the authority. Kajabi/coaching references resolve gaps;
  they do not replace the supplied design or introduce a course-selling model.
- Public client stories use actual owner-supplied, approved content.
- Production manager identity remains unresolved: “all clients” was confirmed,
  but the sign-in email was not supplied. Never grant a public preview alias
  access to real client data.
- Local editing remains on the isolated ngrok preview. Full tests and CI are
  batched, not triggered by each edit. Refresh to see changes.
