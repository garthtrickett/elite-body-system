import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir("dist", { recursive: true });
await rm("dist/fonts", { recursive: true, force: true });
await cp("src/assets/fonts", "dist/fonts", { recursive: true });
await build({ entryPoints: ["src/browser.ts"], bundle: true, format: "esm", platform: "browser",
  target: "es2022", minify: true, outfile: "dist/app.js" });
const css = spawnSync(process.execPath, ["node_modules/@tailwindcss/cli/dist/index.mjs",
  "-i", "src/styles.css", "-o", "dist/app.css", "--minify"], { stdio: "inherit" });
if (css.status !== 0) process.exitCode = 1;
