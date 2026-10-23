/** Debounce work belongs to the route lifetime, including its timer/listener. */
export function routeDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Route disposed")); return; }
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new Error("Route disposed")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
