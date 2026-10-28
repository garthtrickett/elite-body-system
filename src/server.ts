import { readConfig } from "./platform/config.ts";
import { createApplication } from "./platform/application.ts";

const result = readConfig(process.env);
if (!result.ok) {
  console.error(JSON.stringify(result));
  process.exitCode = 1;
} else {
  const config = result.value;
  const app = createApplication(config);
  app.server.on("error", () => { console.error("Server unavailable"); process.exitCode = 1; void app.close(); });
  app.server.listen(config.port, config.host, () => { app.startBackgroundWork(); console.log(`Elite Body System: ${config.publicOrigin}`); });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
  }
}
