import { test } from "node:test";
import assert from "node:assert/strict";
import { createGoogleBookingProvider } from "../src/features/onboarding/index.ts";
import type { Booking } from "../src/features/onboarding/index.ts";

const config = { calendarId: "fixture-calendar", clientId: "fixture-client", clientSecret: "fixture-secret", refreshToken: "fixture-refresh" };
const event = { id: "event1", status: "confirmed", updated: "2026-10-22T10:00:00Z", start: { dateTime: "2026-11-01T10:00:00Z", timeZone: "Europe/London" }, hangoutLink: "https://meet.google.com/abc-defg-hij", extendedProperties: { private: { ebsAccountId: "account-a" } } };
test("Google booking reads server-side account-bound events, caches OAuth and accepts confirmed Meet appointments", async () => {
  let tokens = 0;
  const send: typeof fetch = async (url, options) => {
    if (url === "https://oauth2.googleapis.com/token") { tokens++; assert.equal(options?.method, "POST"); return Response.json({ access_token: "private-access", expires_in: 3600 }); }
    assert.match(String(url), /privateExtendedProperty=ebsAccountId%3Daccount-a/);
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer private-access");
    return Response.json({ items: [event] });
  };
  const provider = createGoogleBookingProvider(config, send);
  const first = await provider.find({ accountId: "account-a", previous: null }); assert.ok(first.ok && first.value); assert.equal(first.value.providerId, "google:event1");
  assert.ok((await provider.find({ accountId: "account-a", previous: null })).ok); assert.equal(tokens, 1);
});
test("Google booking rejects email-only or mismatched ownership, ambiguous calls and absent Meet links", async () => {
  for (const events of [[{ ...event, extendedProperties: undefined, attendees: [{ email: "account-a@example.test" }] }], [{ ...event, extendedProperties: { private: { ebsAccountId: "account-b" } } }], [event, event], [{ ...event, hangoutLink: "https://example.test/call" }]]) {
    const send: typeof fetch = async url => Response.json(url === "https://oauth2.googleapis.com/token" ? { access_token: "test", expires_in: 3600 } : { items: events });
    assert.equal((await createGoogleBookingProvider(config, send).find({ accountId: "account-a", previous: null })).ok, false);
  }
});
test("Google booking reconciles a previously owned cancelled event without trusting caller-selected appointments", async () => {
  const previous: Booking = { providerId: "google:event1", eventVersion: 1, status: "confirmed", startsAt: event.start.dateTime, timezone: "Europe/London", meetUrl: event.hangoutLink };
  const send: typeof fetch = async url => {
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test", expires_in: 3600 });
    if (!String(url).endsWith("/events/event1")) return Response.json({ items: [] });
    return Response.json({ id: "event1", status: "cancelled", updated: "2026-10-22T11:00:00Z" });
  };
  const result = await createGoogleBookingProvider(config, send).find({ accountId: "account-a", previous }); assert.ok(result.ok && result.value); assert.equal(result.value.status, "cancelled");
  assert.equal(result.value.meetUrl, previous.meetUrl);
});
test("Google booking finds an account-bound replacement when rescheduling creates a new event ID", async () => {
  const previous: Booking = { providerId: "google:event1", eventVersion: 1, status: "confirmed", startsAt: event.start.dateTime, timezone: "Europe/London", meetUrl: event.hangoutLink };
  const send: typeof fetch = async url => {
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test", expires_in: 3600 });
    if (String(url).endsWith("/event1")) return Response.json({ id: "event1", status: "cancelled", updated: "2026-10-22T11:00:00Z" });
    return Response.json({ items: [{ ...event, id: "event2" }] });
  };
  const result = await createGoogleBookingProvider(config, send).find({ accountId: "account-a", previous });
  assert.ok(result.ok && result.value); assert.equal(result.value.providerId, "google:event2"); assert.equal(result.value.replacesProviderId, "google:event1");
});
test("Google booking provider failures return a stable error without exposing tokens", async () => {
  const send: typeof fetch = async () => Response.json({ privateProviderDetail: "do not expose" }, { status: 401 });
  const result = await createGoogleBookingProvider(config, send).find({ accountId: "account-a", previous: null }); assert.ok(!result.ok); assert.equal(result.error.code, "unavailable"); assert.doesNotMatch(JSON.stringify(result), /privateProviderDetail|fixture-secret/);
});
