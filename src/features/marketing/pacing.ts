import type { ClientResult } from "../../shared/client-result.ts";
/** One active operation. Reserve each operation's HTTP call count before starting. */
export function createProviderPacing(input: Readonly<{
    requestsPerMinute?: number;
    now?: () => number;
}>) {
    const now = input.now ?? Date.now;
    const ceiling = input.requestsPerMinute === undefined ? undefined : Math.floor(input.requestsPerMinute * 0.8);
    let active = false, nextAt = 0, recent: readonly Readonly<{
        at: number;
        cost: number;
    }>[] = [];
    return async function run<T>(operation: () => Promise<ClientResult<T>>, cost = 1): Promise<ClientResult<T>> {
        const time = now();
        recent = recent.filter(r => r.at > time - 60000);
        if (active || time < nextAt || ceiling !== undefined && recent.reduce((n, r) => n + r.cost, 0) + cost > ceiling)
            return { ok: false, error: { code: "rate_limited", message: "Please wait before starting another research or voice request. Your draft is safe." } };
        active = true;
        nextAt = time + 10000;
        recent = [...recent, { at: time, cost }];
        try {
            return await operation();
        }
        finally {
            active = false;
        }
    };
}
/** Retry-After may be seconds or an HTTP date. A throttle pauses later manual requests. */
export function retryDelay(header: string | null, now = Date.now()): number {
    if (!header)
        return 60000;
    const seconds = Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
    return Number.isFinite(delay) ? Math.max(10000, Math.min(900000, delay)) : 60000;
}
