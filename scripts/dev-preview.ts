import { context } from "esbuild";
import { spawn } from "node:child_process";
import { browserBuildOptions, prepareFonts } from "./build.ts";

// Run under `work run` with the preview's private environment already loaded.
// No test runner, CI trigger, source maps, or public development server.
await prepareFonts();
const browser = await context({ ...browserBuildOptions, logLevel: "info" });
await browser.rebuild();
await browser.watch();
const children = [
  spawn(process.execPath, ["node_modules/@tailwindcss/cli/dist/index.mjs", "-i", "src/styles.css", "-o", "dist/app.css", "--watch=always"], { stdio: "inherit" }),
  spawn(process.execPath, ["--watch", "src/server.ts"], { stdio: "inherit" }),
];
let stopping = false;
async function stop(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  await browser.dispose();
}
for (const child of children) {
  child.once("error", () => { console.error("Preview child process unavailable"); void stop(1); });
  child.once("exit", code => { if (!stopping) void stop(code ?? 1); });
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void stop(0); });
