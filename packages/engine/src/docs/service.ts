import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type {
  DocRecord,
  DocChunk,
  DocsImportRequest,
  DocsImportResponse,
  DocsListRequest,
  DocsListResponse,
  DocsSearchRequest,
  DocsSearchResponse,
  DocsSearchResult,
  DocsOpenRequest,
  DocsOpenResponse
} from "../../../shared/src/contracts";
import { NotFoundError, ValidationError } from "../errors";
import { Logger } from "../logger";
import type { StorageRepos } from "../storage";
import { newId } from "../utils/ids";
import { nowIso } from "../utils/time";
import { chunkText } from "./chunker";
import { extractText } from "./extractor";
import { buildSnippet } from "./snippets";

type DocsServiceOptions = {
  chunkSize: number;
  overlap: number;
  maxSnippetChars: number;
};

const DEFAULT_OPTIONS: DocsServiceOptions = {
  chunkSize: 2000,
  overlap: 200,
  maxSnippetChars: 400
};

export class DocsService {
  private readonly repos: StorageRepos;
  private readonly logger: Logger;
  private readonly options: DocsServiceOptions;

  constructor(repos: StorageRepos, logger: Logger, options?: Partial<DocsServiceOptions>) {
    this.repos = repos;
    this.logger = logger;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  importDocs(request: DocsImportRequest): DocsImportResponse {
    const project = this.repos.projects.getById(request.project_id);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    const projectRoot = project.root_path;
    const docsDir = ensureDocsDir(projectRoot);
    const result: DocsImportResponse = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const filePath of request.file_paths) {
      try {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
          throw new Error("File not found");
        }

        const buffer = fs.readFileSync(resolved);
        const sha256 = hashBuffer(buffer);
        const existing = this.repos.docs.getByProjectAndHash(project.id, sha256);
        if (existing) {
          result.skipped += 1;
          continue;
        }

        const docId = newId();
        const safeName = buildSafeFileName(resolved, docId);
        const destPath = path.join(docsDir, safeName);
        fs.copyFileSync(resolved, destPath);

        const stats = fs.statSync(destPath);
        const extracted = extractText(destPath);
        const chunks = chunkText(extracted.text, {
          chunkSize: this.options.chunkSize,
          overlap: this.options.overlap
        });

        const fileExt = path.extname(destPath).replace(/^\./, "").toLowerCase();
        const record: DocRecord = {
          doc_id: docId,
          project_id: project.id,
          source_path: path.relative(projectRoot, destPath),
          file_name: safeName,
          file_ext: fileExt,
          sha256,
          bytes: stats.size,
          mime: extracted.mime,
          title: extracted.title,
          tool_name: request.tags?.tool_name,
          category: request.tags?.category,
          created_at: nowIso()
        };

        this.repos.docs.create(record);
        const chunkRecords = chunks.map((chunk) =>
          toChunkRecord(docId, chunk)
        );
        this.repos.docChunks.insertAll(chunkRecords);
        result.imported += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        result.errors.push({ file_path: filePath, error: message });
      }
    }

    return result;
  }

  listDocs(request: DocsListRequest): DocsListResponse {
    const project = this.repos.projects.getById(request.project_id);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    const docs = this.repos.docs.list(request.project_id, request.filter);
    return { docs };
  }

  searchDocs(request: DocsSearchRequest): DocsSearchResponse {
    const project = this.repos.projects.getById(request.project_id);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const query = request.query.trim();
    if (!query) {
      return { results: [] };
    }

    const topK = request.top_k ?? 6;
    try {
      const rows = this.repos.docChunks.search(
        request.project_id,
        query,
        topK,
        request.filter
      );
      const results: DocsSearchResult[] = rows.map((row) => ({
        doc_id: row.doc_id,
        chunk_id: row.chunk_id,
        score: row.score,
        snippet: buildSnippet(row.text, this.options.maxSnippetChars),
        file_name: row.file_name,
        tool_name: row.tool_name ?? undefined,
        category: row.category ?? undefined
      }));
      return { results };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid search query";
      throw new ValidationError(message);
    }
  }

  openDoc(request: DocsOpenRequest): DocsOpenResponse {
    const project = this.repos.projects.getById(request.project_id);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    const doc = this.repos.docs.getById(request.doc_id);
    if (!doc || doc.project_id !== project.id) {
      throw new NotFoundError("Document not found");
    }
    const absolutePath = path.isAbsolute(doc.source_path)
      ? doc.source_path
      : path.resolve(project.root_path, doc.source_path);
    return { doc, absolute_path: absolutePath };
  }

  ensureProjectDocsDir(projectRoot: string): void {
    try {
      ensureDocsDir(projectRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn("Failed to ensure docs directory", {
        project_root: projectRoot,
        error: message
      });
    }
  }
}

function ensureDocsDir(projectRoot: string): string {
  if (!projectRoot) {
    throw new ValidationError("Project root path is required");
  }
  const docsDir = path.resolve(projectRoot, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  return docsDir;
}

function buildSafeFileName(sourcePath: string, docId: string): string {
  const original = path.basename(sourcePath);
  const ext = path.extname(original);
  const base = ext ? original.slice(0, -ext.length) : original;
  const safeBase = base
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallback = safeBase || "doc";
  return `${fallback}-${docId}${ext.toLowerCase()}`;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function toChunkRecord(docId: string, chunk: { text: string; start_offset: number; end_offset: number; ordinal: number }): DocChunk {
  return {
    chunk_id: newId(),
    doc_id: docId,
    ordinal: chunk.ordinal,
    text: chunk.text,
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    created_at: nowIso()
  };
}
