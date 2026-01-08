import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import { nowIso } from "../utils/time";

type Migration = {
  id: string;
  name: string;
  up: (db: Database.Database) => void;
};

const SCHEMA_PATH = path.resolve(
  process.cwd(),
  "packages",
  "engine",
  "src",
  "storage",
  "schema.sql"
);

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === columnName);
}

const migrations: Migration[] = [
  {
    id: "0001",
    name: "baseline",
    up: (db) => {
      const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
      db.exec(schema);
    }
  },
  {
    id: "0002",
    name: "artifact-hash",
    up: (db) => {
      if (!columnExists(db, "artifacts", "hash")) {
        db.exec("ALTER TABLE artifacts ADD COLUMN hash TEXT");
      }
    }
  },
  {
    id: "0003",
    name: "mission-manifests-and-events",
    up: (db) => {
      if (!tableExists(db, "mission_manifests")) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS mission_manifests (
            mission_id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL UNIQUE,
            objective TEXT NOT NULL,
            scope_targets TEXT NOT NULL,
            constraints TEXT,
            success_criteria TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
          )
        `);
      }
      if (!tableExists(db, "run_events")) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS run_events (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
          )
        `);
      }
    }
  },
  {
    id: "0004",
    name: "run-lineage-and-provenance",
    up: (db) => {
      // SQLite cannot add foreign keys via ALTER TABLE; legacy DBs keep FK enforcement from creation time.
      const columns = [
        { name: "workflow_json", type: "TEXT" },
        { name: "parent_run_id", type: "TEXT" },
        { name: "forked_from_step_id", type: "TEXT" },
        { name: "replay_of_run_id", type: "TEXT" },
        { name: "planner_prompt_version", type: "TEXT" },
        { name: "critic_prompt_version", type: "TEXT" },
        { name: "planner_latency_ms", type: "INTEGER" },
        { name: "tokens_estimate", type: "INTEGER" }
      ];
      for (const column of columns) {
        if (!columnExists(db, "runs", column.name)) {
          db.exec(`ALTER TABLE runs ADD COLUMN ${column.name} ${column.type}`);
        }
      }
    }
  },
  {
    id: "0005",
    name: "evidence-table",
    up: (db) => {
      if (!tableExists(db, "evidence")) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS evidence (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            run_id TEXT,
            step_id TEXT,
            chat_id TEXT,
            artifact_id TEXT,
            kind TEXT NOT NULL,
            path TEXT NOT NULL,
            description TEXT,
            hash TEXT,
            media_type TEXT,
            size_bytes INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
            FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
          )
        `);
      }
    }
  }
];

export function migrate(db: Database.Database): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );
  const appliedRows = db.prepare("SELECT id FROM schema_migrations").all() as Array<{
    id: string;
  }>;
  const applied = new Set(appliedRows.map((row) => row.id));
  const appliedNow: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, nowIso());
    })();
    appliedNow.push(migration.id);
  }

  return appliedNow;
}
