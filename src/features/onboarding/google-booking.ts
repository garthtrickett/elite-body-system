import { isRecord } from "../../shared/validation.ts";
import { err, ok } from "../../shared/result.ts";
import type { ClientResult } from "../../shared/client-result.ts";
import { isMeetUrl } from "./data.ts";
import type { Booking } from "./data.ts";

export type GoogleBookingConfig = Readonly<{ calendarId: string; clientId: string; clientSecret: string; refreshToken: string }>;
export type VerifiedBooking = Booking & Readonly<{ replacesProviderId?: string }>;
export type BookingProvider = Readonly<{ find: (input: Readonly<{ accountId: string; previous: Booking | null }>) => Promise<ClientResult<VerifiedBooking | null>> }>;
export function createGoogleBookingProvider(config: GoogleBookingConfig, send: typeof fetch = fetch): BookingProvider {
  let token = "", expiresAt = 0;
  async function accessToken(): Promise<string> {
    if (token && Date.now() < expiresAt) return token;
    const response = await send("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(10000), body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken }) });
    const value: unknown = await response.json();
    if (!response.ok || !isRecord(value) || typeof value.access_token !== "string" || typeof value.expires_in !== "number" || value.expires_in < 60) throw new Error("Calendar unavailable");
    token = value.access_token; expiresAt = Date.now() + (value.expires_in - 60) * 1000;
    return token;
  }
  return {
    async find({ accountId, previous }) {
      try {
        const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`;
        const eventId = previous?.providerId.startsWith("google:") ? previous.providerId.slice(7) : null;
        const get = async (url: string, allowMissing = false) => {
          let response = await send(url, { headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(10000) });
          if (response.status === 401) {
            await response.body?.cancel(); token = ""; expiresAt = 0;
            response = await send(url, { headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(10000) });
          }
          if (allowMissing && [404, 410].includes(response.status)) { await response.body?.cancel(); return null; }
          const value: unknown = await response.json();
          if (!response.ok || !isRecord(value)) throw new Error("Calendar unavailable");
          return value;
        };
        const listed = async (): Promise<unknown> => {
          const value = await get(`${base}?${new URLSearchParams({ privateExtendedProperty: `ebsAccountId=${accountId}`, maxResults: "2", showDeleted: "false" })}`);
          if (!value || !Array.isArray(value.items)) throw new Error("Invalid calendar events");
          if (!value.items.length) return null;
          if (value.items.length !== 1 || value.nextPageToken) throw new Error("Ambiguous calendar events");
          return value.items[0];
        };
        let event: unknown = eventId ? await get(`${base}/${encodeURIComponent(eventId)}`, true) : await listed();
        if (eventId && event === null) {
          event = await listed();
          if (event === null) return err({ code: "not_configured", message: "Your previous appointment can no longer be verified. Contact Harry or book a new call, then refresh confirmation." });
        }
        if (event === null) return ok(null);
        if (eventId && isRecord(event) && event.status === "cancelled") {
          const replacement = await listed();
          if (replacement !== null) event = replacement;
        }
        if (!isRecord(event) || typeof event.id !== "string" || !["confirmed", "cancelled"].includes(String(event.status))) throw new Error("Invalid calendar event");
        const properties = isRecord(event.extendedProperties) && isRecord(event.extendedProperties.private) ? event.extendedProperties.private : null;
        if (!(event.status === "cancelled" && eventId && event.id === eventId) && properties?.ebsAccountId !== accountId) return err({ code: "forbidden", message: "This appointment is not linked to your client account. Contact Harry." });
        const start = isRecord(event.start) ? event.start : null;
        const startsAt = typeof start?.dateTime === "string" ? start.dateTime : event.status === "cancelled" ? previous?.startsAt : undefined;
        const timezone = typeof start?.timeZone === "string" ? start.timeZone : previous?.timezone ?? "UTC";
        const meetUrl = typeof event.hangoutLink === "string" ? event.hangoutLink : event.status === "cancelled" ? previous?.meetUrl : undefined;
        const updated = typeof event.updated === "string" ? Date.parse(event.updated) : event.status === "cancelled" && eventId === event.id && previous ? previous.eventVersion + (previous.status === "cancelled" ? 0 : 1) : NaN;
        if (!startsAt || !Number.isFinite(Date.parse(startsAt)) || !isMeetUrl(meetUrl) || !Number.isSafeInteger(updated)) return err({ code: "not_configured", message: "Your appointment needs a confirmed time and a Google Meet link. Contact Harry." });
        new Intl.DateTimeFormat("en", { timeZone: timezone });
        return ok({ providerId: `google:${event.id}`, eventVersion: updated, status: event.status as Booking["status"], startsAt: new Date(startsAt).toISOString(), timezone, meetUrl,
          ...(previous && previous.providerId !== `google:${event.id}` ? { replacesProviderId: previous.providerId } : {}) });
      } catch (error) {
        return error instanceof Error && error.message === "Ambiguous calendar events"
          ? err({ code: "conflict", message: "More than one onboarding appointment is linked to your account. Contact Harry to confirm the right call." })
          : err({ code: "unavailable", message: "Google Calendar confirmation is temporarily unavailable. Try again." });
      }
    },
  };
}
