import type Database from "better-sqlite3";
import type { RunEvent } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

export class RunEventsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  append(event: RunEvent): void {
    this.db
      .prepare(
        "INSERT INTO run_events (id, run_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(newId(), event.run_id, event.type, JSON.stringify(event), nowIso());
  }
}
