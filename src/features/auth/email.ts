/** Adapted from Abby. Canonicalize the domain only; mailbox local parts can be case-sensitive. */
export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 254 || /[\r\n\u0000]/.test(value)) return undefined;
  const email = value.trim();
  const at = email.lastIndexOf("@");
  if (at < 1 || at > 64 || email.indexOf("@") !== at) return undefined;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith(".") ||
      local.endsWith(".") || local.includes("..") || !domain.includes(".") ||
      domain.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return undefined;
  return `${local}@${domain}`;
}
