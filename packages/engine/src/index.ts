import path from "path";
import { Engine } from "./engine";
import { Logger } from "./logger";
import type { EngineConfig } from "./config";
export { Engine } from "./engine";
export { EngineIpcServer } from "./ipc/server";
export { InMemoryIpcTransport } from "./ipc/transport";
export type { EngineConfig } from "./config";

export async function startEngine(config: EngineConfig): Promise<Engine> {
  const engine = new Engine(config);
  await engine.start();
  return engine;
}

if (require.main === module) {
  void (async () => {
    const dbPath =
      process.env.PRIME_DB_PATH ?? path.resolve(process.cwd(), "prime-cli.db");
    const artifactsDir =
      process.env.PRIME_ARTIFACTS_DIR ??
      path.resolve(process.cwd(), "artifacts");
    const logLevel = (process.env.PRIME_LOG_LEVEL ?? "info") as EngineConfig["logLevel"];
    const logger = new Logger(logLevel);
    const engine = new Engine({ dbPath, artifactsDir, logLevel }, { logger });
    await engine.start();

    logger.info("Engine started", { dbPath, artifactsDir });

    const shutdown = async () => {
      await engine.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })();
}
