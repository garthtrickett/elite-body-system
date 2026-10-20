import type { ClientResult } from "../../shared/client-result.ts";
import type { MealPhoto } from "./provider.ts";
/** Decode locally, strip metadata, bound dimensions and encoded size before upload. */
export async function prepareMealPhotos(input: Readonly<{ files: readonly File[]; remaining: number }>): Promise<ClientResult<readonly MealPhoto[]>> {
  if (input.files.length < 1 || input.files.length > input.remaining) return { ok: false, error: { code: "invalid_input", message: `Choose up to ${input.remaining} photos.` } };
  const photos: MealPhoto[] = [];
  try {
    for (const file of input.files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) return { ok: false, error: { code: "invalid_input", message: "Choose JPEG, PNG or WebP photos under 12 MiB each." } };
      const bitmap = await createImageBitmap(file);
      try {
        const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
        const context = canvas.getContext("2d"); if (!context) throw new Error("Image unavailable");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let data = canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? "";
        if (data.length > 1398104) data = canvas.toDataURL("image/jpeg", 0.55).split(",")[1] ?? "";
        if (!data || data.length > 1398104) return { ok: false, error: { code: "invalid_input", message: "This photo is too large after resizing. Choose a smaller photo." } };
        photos.push({ mediaType: "image/jpeg", data });
      } finally { bitmap.close(); }
    }
    return { ok: true, value: photos };
  } catch { return { ok: false, error: { code: "invalid_input", message: "A photo could not be opened. Choose another JPEG, PNG or WebP file." } }; }
}
