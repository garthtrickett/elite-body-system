import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir("dist", { recursive: true });
await build({ entryPoints: ["src/browser.ts"], bundle: true, format: "esm", platform: "browser",
  target: "es2022", minify: true, outfile: "dist/app.js" });
const css = spawnSync(process.execPath, ["node_modules/@tailwindcss/cli/dist/index.mjs",
  "-i", "src/styles.css", "-o", "dist/app.css", "--minify"], { stdio: "inherit" });
if (css.status !== 0) process.exitCode = 1;
