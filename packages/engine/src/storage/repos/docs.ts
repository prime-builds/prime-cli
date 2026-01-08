import type Database from "better-sqlite3";
import type { DocRecord, DocsListRequest } from "../../../../shared/src/contracts";

type DocRow = {
  doc_id: string;
  project_id: string;
  source_path: string;
  file_name: string;
  file_ext: string;
  sha256: string;
  bytes: number;
  mime: string | null;
  title: string | null;
  tool_name: string | null;
  category: string | null;
  created_at: string;
};

export class DocsRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(record: DocRecord): DocRecord {
    this.db
      .prepare(
        `
        INSERT INTO docs (
          doc_id,
          project_id,
          source_path,
          file_name,
          file_ext,
          sha256,
          bytes,
          mime,
          title,
          tool_name,
          category,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.doc_id,
        record.project_id,
        record.source_path,
        record.file_name,
        record.file_ext,
        record.sha256,
        record.bytes,
        record.mime ?? null,
        record.title ?? null,
        record.tool_name ?? null,
        record.category ?? null,
        record.created_at
      );
    return record;
  }

  list(projectId: string, filter?: DocsListRequest["filter"]): DocRecord[] {
    const conditions: string[] = ["project_id = ?"];
    const params: Array<string | number> = [projectId];

    if (filter?.tool_name) {
      conditions.push("tool_name = ?");
      params.push(filter.tool_name);
    }
    if (filter?.category) {
      conditions.push("category = ?");
      params.push(filter.category);
    }
    if (filter?.ext) {
      conditions.push("file_ext = ?");
      params.push(normalizeExt(filter.ext));
    }

    const sql = `
      SELECT * FROM docs
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
    `;
    const rows = this.db.prepare(sql).all(...params) as DocRow[];
    return rows.map((row) => this.toRecord(row));
  }

  getById(docId: string): DocRecord | null {
    const row = this.db
      .prepare("SELECT * FROM docs WHERE doc_id = ?")
      .get(docId) as DocRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  getByProjectAndHash(projectId: string, sha256: string): DocRecord | null {
    const row = this.db
      .prepare("SELECT * FROM docs WHERE project_id = ? AND sha256 = ?")
      .get(projectId, sha256) as DocRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  private toRecord(row: DocRow): DocRecord {
    return {
      doc_id: row.doc_id,
      project_id: row.project_id,
      source_path: row.source_path,
      file_name: row.file_name,
      file_ext: row.file_ext,
      sha256: row.sha256,
      bytes: row.bytes,
      mime: row.mime ?? undefined,
      title: row.title ?? undefined,
      tool_name: row.tool_name ?? undefined,
      category: row.category ?? undefined,
      created_at: row.created_at
    };
  }
}

function normalizeExt(ext: string): string {
  return ext.replace(/^\./, "").toLowerCase();
}
