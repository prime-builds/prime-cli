import type Database from "better-sqlite3";
import type { Run, RunStatus } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

type RunRow = {
  id: string;
  project_id: string;
  chat_id: string | null;
  workflow_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

export class RunsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: {
    project_id: string;
    chat_id?: string;
    workflow_id: string;
    status?: RunStatus;
    started_at?: string;
  }): Run {
    const id = newId();
    const createdAt = nowIso();
    const status = input.status ?? "pending";
    this.db
      .prepare(
        "INSERT INTO runs (id, project_id, chat_id, workflow_id, status, created_at, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.project_id,
        input.chat_id ?? null,
        input.workflow_id,
        status,
        createdAt,
        input.started_at ?? null
      );
    return {
      id,
      project_id: input.project_id,
      chat_id: input.chat_id,
      workflow_id: input.workflow_id,
      status,
      created_at: createdAt,
      started_at: input.started_at
    };
  }

  updateStatus(
    runId: string,
    status: RunStatus,
    updates?: { started_at?: string; finished_at?: string; error?: string | null }
  ): Run | null {
    const current = this.getById(runId);
    if (!current) {
      return null;
    }
    const startedAt = updates?.started_at ?? current.started_at ?? null;
    const finishedAt = updates?.finished_at ?? current.finished_at ?? null;
    const error = updates?.error ?? current.error ?? null;
    this.db
      .prepare(
        "UPDATE runs SET status = ?, started_at = ?, finished_at = ?, error = ? WHERE id = ?"
      )
      .run(status, startedAt, finishedAt, error, runId);
    return {
      ...current,
      status,
      started_at: startedAt ?? undefined,
      finished_at: finishedAt ?? undefined,
      error: error ?? undefined
    };
  }

  getById(runId: string): Run | null {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(runId) as RunRow | undefined;
    return row ? this.toRun(row) : null;
  }

  private toRun(row: RunRow): Run {
    return {
      id: row.id,
      project_id: row.project_id,
      chat_id: row.chat_id ?? undefined,
      workflow_id: row.workflow_id,
      status: row.status as RunStatus,
      created_at: row.created_at,
      started_at: row.started_at ?? undefined,
      finished_at: row.finished_at ?? undefined,
      error: row.error ?? undefined
    };
  }
}
