import type Database from "better-sqlite3";
import type { Artifact } from "../../../../shared/src/contracts";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

type ArtifactRow = {
  id: string;
  project_id: string;
  run_id: string | null;
  step_id: string | null;
  chat_id: string | null;
  name: string;
  hash: string | null;
  path: string;
  media_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export class ArtifactsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: {
    project_id: string;
    run_id?: string;
    step_id?: string;
    chat_id?: string;
    name: string;
    hash?: string;
    path: string;
    media_type?: string;
    size_bytes?: number;
  }): Artifact {
    const id = newId();
    const createdAt = nowIso();
    this.db
      .prepare(
        "INSERT INTO artifacts (id, project_id, run_id, step_id, chat_id, name, hash, path, media_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        input.project_id,
        input.run_id ?? null,
        input.step_id ?? null,
        input.chat_id ?? null,
        input.name,
        input.hash ?? null,
        input.path,
        input.media_type ?? null,
        input.size_bytes ?? null,
        createdAt
      );
    return {
      id,
      project_id: input.project_id,
      run_id: input.run_id,
      step_id: input.step_id,
      chat_id: input.chat_id,
      name: input.name,
      hash: input.hash,
      path: input.path,
      media_type: input.media_type,
      size_bytes: input.size_bytes,
      created_at: createdAt
    };
  }

  list(filters: { project_id?: string; run_id?: string; chat_id?: string }): Artifact[] {
    const clauses: string[] = [];
    const params: Array<string> = [];

    if (filters.project_id) {
      clauses.push("project_id = ?");
      params.push(filters.project_id);
    }
    if (filters.run_id) {
      clauses.push("run_id = ?");
      params.push(filters.run_id);
    }
    if (filters.chat_id) {
      clauses.push("chat_id = ?");
      params.push(filters.chat_id);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM artifacts ${where} ORDER BY created_at DESC`)
      .all(...params) as ArtifactRow[];
    return rows.map(this.toArtifact);
  }

  getById(id: string): Artifact | null {
    const row = this.db
      .prepare("SELECT * FROM artifacts WHERE id = ?")
      .get(id) as ArtifactRow | undefined;
    return row ? this.toArtifact(row) : null;
  }

  private toArtifact(row: ArtifactRow): Artifact {
    return {
      id: row.id,
      project_id: row.project_id,
      run_id: row.run_id ?? undefined,
      step_id: row.step_id ?? undefined,
      chat_id: row.chat_id ?? undefined,
      name: row.name,
      hash: row.hash ?? undefined,
      path: row.path,
      media_type: row.media_type ?? undefined,
      size_bytes: row.size_bytes ?? undefined,
      created_at: row.created_at
    };
  }
}
