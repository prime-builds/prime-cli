import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { Logger } from "../logger";

const DEFAULT_SCHEMA_PATH = path.resolve(
  process.cwd(),
  "packages",
  "engine",
  "src",
  "storage",
  "schema.sql"
);

export function openDatabase(dbPath: string, logger: Logger): Database.Database {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(DEFAULT_SCHEMA_PATH, "utf8");
  db.exec(schema);

  logger.info("Database initialized", { dbPath });
  return db;
}
