import type Database from "better-sqlite3";
import type { DocChunk, DocsSearchRequest } from "../../../../shared/src/contracts";

export type DocChunkSearchRow = {
  chunk_id: string;
  doc_id: string;
  text: string;
  score: number;
  file_name: string;
  tool_name?: string | null;
  category?: string | null;
};

export class DocChunksRepo {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insertAll(chunks: DocChunk[]): void {
    if (chunks.length === 0) {
      return;
    }

    const insertChunk = this.db.prepare(
      `
      INSERT INTO doc_chunks (
        chunk_id,
        doc_id,
        ordinal,
        text,
        start_offset,
        end_offset,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    );
    const insertFts = this.db.prepare(
      "INSERT INTO doc_chunks_fts (chunk_id, doc_id, text) VALUES (?, ?, ?)"
    );

    const tx = this.db.transaction((rows: DocChunk[]) => {
      for (const chunk of rows) {
        insertChunk.run(
          chunk.chunk_id,
          chunk.doc_id,
          chunk.ordinal,
          chunk.text,
          chunk.start_offset ?? null,
          chunk.end_offset ?? null,
          chunk.created_at
        );
        insertFts.run(chunk.chunk_id, chunk.doc_id, chunk.text);
      }
    });
    tx(chunks);
  }

  search(
    projectId: string,
    query: string,
    topK: number,
    filter?: DocsSearchRequest["filter"]
  ): DocChunkSearchRow[] {
    const conditions: string[] = ["d.project_id = ?"];
    const params: Array<string | number> = [projectId];

    if (filter?.tool_name) {
      conditions.push("d.tool_name = ?");
      params.push(filter.tool_name);
    }
    if (filter?.category) {
      conditions.push("d.category = ?");
      params.push(filter.category);
    }

    const sql = `
      SELECT
        doc_chunks_fts.chunk_id,
        doc_chunks_fts.doc_id,
        c.text,
        bm25(doc_chunks_fts) AS score,
        d.file_name,
        d.tool_name,
        d.category
      FROM doc_chunks_fts
      JOIN doc_chunks c ON c.chunk_id = doc_chunks_fts.chunk_id
      JOIN docs d ON d.doc_id = doc_chunks_fts.doc_id
      WHERE doc_chunks_fts MATCH ? AND ${conditions.join(" AND ")}
      ORDER BY score ASC, c.ordinal ASC
      LIMIT ?
    `;
    const rows = this.db
      .prepare(sql)
      .all(query, ...params, topK) as Array<DocChunkSearchRow & { score: number }>;

    return rows.map((row) => ({
      chunk_id: row.chunk_id,
      doc_id: row.doc_id,
      text: row.text,
      score: row.score,
      file_name: row.file_name,
      tool_name: row.tool_name ?? undefined,
      category: row.category ?? undefined
    }));
  }
}
