import type Database from "better-sqlite3";
import { newId } from "../../utils/ids";
import { nowIso } from "../../utils/time";

export type EvidenceRecord = {
  id: string;
  project_id: string;
  run_id?: string | null;
  step_id?: string | null;
  chat_id?: string | null;
  artifact_id?: string | null;
  kind: string;
  path: string;
  description?: string | null;
  hash?: string | null;
  media_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
};

export class EvidenceRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: Omit<EvidenceRecord, "id" | "created_at">): EvidenceRecord {
    const id = newId();
    const created_at = nowIso();
    const record: EvidenceRecord = { id, created_at, ...input };

    this.db
      .prepare(
        `
        INSERT INTO evidence (
          id,
          project_id,
          run_id,
          step_id,
          chat_id,
          artifact_id,
          kind,
          path,
          description,
          hash,
          media_type,
          size_bytes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.id,
        record.project_id,
        record.run_id ?? null,
        record.step_id ?? null,
        record.chat_id ?? null,
        record.artifact_id ?? null,
        record.kind,
        record.path,
        record.description ?? null,
        record.hash ?? null,
        record.media_type ?? null,
        record.size_bytes ?? null,
        record.created_at
      );

    return record;
  }
}
