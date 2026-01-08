import Database from "better-sqlite3";
import { Logger } from "../logger";
import { migrate } from "./migrations";

export function openDatabase(dbPath: string, logger: Logger): Database.Database {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  // Migrations are applied in-order and designed to be idempotent for legacy DBs.
  const applied = migrate(db);
  if (applied.length > 0) {
    logger.info("Database migrations applied", { applied });
  }

  logger.info("Database initialized", { dbPath });
  return db;
}
