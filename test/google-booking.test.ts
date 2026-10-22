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
test("Google booking reconciles a missing old event with one verified account-bound replacement", async () => {
  const previous: Booking = { providerId: "google:event1", eventVersion: 1, status: "confirmed", startsAt: event.start.dateTime, timezone: "Europe/London", meetUrl: event.hangoutLink };
  for (const status of [404, 410]) {
    const send: typeof fetch = async url => {
      if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test", expires_in: 3600 });
      if (String(url).endsWith("/event1")) return Response.json({ error: { code: status } }, { status });
      return Response.json({ items: [{ ...event, id: "event2" }] });
    };
    const result = await createGoogleBookingProvider(config, send).find({ accountId: "account-a", previous });
    assert.ok(result.ok && result.value); assert.equal(result.value.providerId, "google:event2"); assert.equal(result.value.replacesProviderId, previous.providerId);
  }
});
test("a missing previous event cannot preserve an unverified booking or bypass replacement ownership", async () => {
  const previous: Booking = { providerId: "google:event1", eventVersion: 1, status: "confirmed", startsAt: event.start.dateTime, timezone: "Europe/London", meetUrl: event.hangoutLink };
  for (const items of [[], [{ ...event, extendedProperties: undefined }]]) {
    const send: typeof fetch = async url => url === "https://oauth2.googleapis.com/token" ? Response.json({ access_token: "test", expires_in: 3600 }) : String(url).endsWith("/event1") ? Response.json({}, { status: 404 }) : Response.json({ items });
    const result = await createGoogleBookingProvider(config, send).find({ accountId: "account-a", previous }); assert.equal(result.ok, false);
  }
});
test("Google authorization failures refresh the token once and remain bounded if credentials stay invalid", async () => {
  for (const recovers of [true, false]) {
    let tokens = 0, requests = 0;
    const send: typeof fetch = async url => {
      if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: `test-${++tokens}`, expires_in: 3600 });
      return ++requests === 2 && recovers ? Response.json({ items: [event] }) : Response.json({ error: "invalid credentials" }, { status: 401 });
    };
    const result = await createGoogleBookingProvider(config, send).find({ accountId: "account-a", previous: null });
    assert.equal(result.ok, recovers); assert.equal(tokens, 2); assert.equal(requests, 2);
  }
});
test("sparse Google cancellation tombstones revoke a known booking and reconcile idempotently", async () => {
  const previous: Booking = { providerId: "google:event1", eventVersion: 100, status: "confirmed", startsAt: event.start.dateTime, timezone: "Europe/London", meetUrl: event.hangoutLink };
  const send: typeof fetch = async url => url === "https://oauth2.googleapis.com/token" ? Response.json({ access_token: "test", expires_in: 3600 }) : String(url).endsWith("/event1") ? Response.json({ id: "event1", status: "cancelled" }) : Response.json({ items: [] });
  const provider = createGoogleBookingProvider(config, send);
  const cancelled = await provider.find({ accountId: "account-a", previous }); assert.ok(cancelled.ok && cancelled.value);
  assert.equal(cancelled.value.status, "cancelled"); assert.equal(cancelled.value.eventVersion, 101);
  const repeated = await provider.find({ accountId: "account-a", previous: cancelled.value }); assert.ok(repeated.ok && repeated.value);
  assert.deepEqual(repeated.value, cancelled.value);
});
