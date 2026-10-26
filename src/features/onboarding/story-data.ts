import { isRecord, isText } from "../../shared/validation.ts";

export type MarketingStory = Readonly<{ id: string; title: string; results: string; testimonial: string; mediaIds: readonly string[]; clientName: string; createdAt: string }>;
export const storyId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function parseStoryContent(value: unknown): Pick<MarketingStory, "title" | "results" | "testimonial" | "mediaIds"> | undefined {
  if (!isRecord(value) || !isText(value.title, 100) || !value.title.trim() || !isText(value.results, 2000) || !isText(value.testimonial, 2000) || !Array.isArray(value.mediaIds) || value.mediaIds.length > 6 || !value.mediaIds.every(storyId) || new Set(value.mediaIds).size !== value.mediaIds.length || !value.results.trim() && !value.testimonial.trim() && !value.mediaIds.length) return undefined;
  return { title: value.title.trim(), results: value.results.trim(), testimonial: value.testimonial.trim(), mediaIds: [...value.mediaIds] };
}
export function parseMarketingStory(value: unknown): MarketingStory | undefined {
  const content = parseStoryContent(value);
  return content && isRecord(value) && storyId(value.id) && isText(value.clientName, 100) && isText(value.createdAt, 100) && Number.isFinite(Date.parse(value.createdAt)) ? { ...content, id: value.id, clientName: value.clientName, createdAt: value.createdAt } : undefined;
}
export function storyMaterials(input: Readonly<{ story: MarketingStory }>) {
  const { story } = input;
  return { photosVideos: !!story.mediaIds.length, results: !!story.results, testimonials: !!story.testimonial } as const;
}
