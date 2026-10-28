import { isDay, isRecord, isText } from "../../shared/validation.ts";
import { parseEntry } from "./data.ts";
import type { Entry } from "./data.ts";

export type MentorSummary = Readonly<{ wentWell: readonly string[]; needsAttention: readonly string[] }>;
export type MentorItem = Readonly<{ clientId: string; clientName: string; entry: Entry; summary: MentorSummary | null }>;
export type MentorQueue = Readonly<{ items: readonly MentorItem[]; total: number; summaryAvailable: boolean }>;
export type MentorHistoryEntry = Readonly<{ entry: Entry; reviewedAt: string | null }>;
export type MentorHistory = Readonly<{ clientName: string; entries: readonly MentorHistoryEntry[]; nextCursor: string | null }>;
export const validAccountId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const mentorKey = (input: Readonly<{ clientId: string; week: string }>) => `${input.clientId}/${input.week}`;
export function parseMentorSummary(value: unknown): MentorSummary | undefined {
  if (!isRecord(value)) return;
  const valid = (items: unknown): items is readonly string[] => Array.isArray(items) && items.length <= 5 && items.every(item => isText(item, 700) && item.trim());
  if (!valid(value.wentWell) || !valid(value.needsAttention)) return;
  return { wentWell: value.wentWell.map(item => item.trim()), needsAttention: value.needsAttention.map(item => item.trim()) };
}
export function parseMentorQueue(value: unknown): MentorQueue | undefined {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 50 || typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < value.items.length || typeof value.summaryAvailable !== "boolean") return;
  const items: MentorItem[] = [];
  for (const item of value.items) {
    if (!isRecord(item) || !validAccountId(item.clientId) || !isText(item.clientName, 320) || !item.clientName.trim()) return;
    const entry = parseEntry(item.entry), summary = item.summary === null ? null : parseMentorSummary(item.summary);
    if (!entry?.submittedAt || summary === undefined) return;
    items.push({ clientId: item.clientId, clientName: item.clientName, entry, summary });
  }
  return { items, total: value.total, summaryAvailable: value.summaryAvailable };
}
export function parseMentorHistory(value: unknown): MentorHistory | undefined {
  if (!isRecord(value) || !isText(value.clientName, 320) || !Array.isArray(value.entries) || value.entries.length > 26 || !(value.nextCursor === null || isDay(value.nextCursor))) return;
  const entries: MentorHistoryEntry[] = [];
  for (const item of value.entries) {
    if (!isRecord(item) || !(item.reviewedAt === null || typeof item.reviewedAt === "string" && Number.isFinite(Date.parse(item.reviewedAt)))) return;
    const entry = parseEntry(item.entry);
    if (!entry?.submittedAt) return;
    entries.push({ entry, reviewedAt: item.reviewedAt });
  }
  return { clientName: value.clientName, entries, nextCursor: value.nextCursor };
}
export function parseReviewReceipt(value: unknown): Readonly<{ reviewed: true }> | undefined {
  return isRecord(value) && value.reviewed === true ? { reviewed: true } : undefined;
}
