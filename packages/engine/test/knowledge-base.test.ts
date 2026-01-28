import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { Engine } from "../src/engine";
import { DocsService } from "../src/docs";
import { EmptyAdapterRegistry } from "../src/adapters/registry";
import { createRepos } from "../src/storage";
import { openDatabase } from "../src/storage/db";
import { Logger } from "../src/logger";
import { buildPlannerContext } from "../src/planner/context";

function createTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prime-cli-${label}-`));
}

test("docs import, search, and planner context includes snippets", async () => {
  const tempDir = createTempDir("kb");
  const projectRoot = path.join(tempDir, "project");
  fs.mkdirSync(projectRoot, { recursive: true });

  const dbPath = path.join(tempDir, "engine.db");
  const engine = new Engine(
    {
      dbPath,
      artifactsDir: path.join(tempDir, "artifacts"),
      logLevel: "error"
    },
    {
      adapterRegistry: new EmptyAdapterRegistry()
    }
  );
  await engine.start();

  const { project } = await engine.createProject({
    name: "Docs Project",
    root_path: projectRoot
  });

  const sourceDir = path.join(tempDir, "source");
  fs.mkdirSync(sourceDir, { recursive: true });
  const mdPath = path.join(sourceDir, "guide.md");
  const htmlPath = path.join(sourceDir, "page.html");
  fs.writeFileSync(mdPath, "# Tool Guide\nUse adapter alpha for discovery.\n", "utf8");
  fs.writeFileSync(
    htmlPath,
    "<html><head><title>Tool Alpha</title></head><body><h1>Adapter Alpha</h1><p>Use adapter alpha.</p></body></html>",
    "utf8"
  );

  const importResult = await engine.importDocs({
    project_id: project.id,
    file_paths: [mdPath, htmlPath],
    tags: { tool_name: "alpha", category: "web" }
  });
  assert.equal(importResult.imported, 2);
  assert.equal(importResult.skipped, 0);
  assert.equal(importResult.errors.length, 0);

  const { docs } = await engine.listDocs({ project_id: project.id });
  assert.equal(docs.length, 2);

  const openResult = await engine.openDoc({ project_id: project.id, doc_id: docs[0].doc_id });
  assert.ok(fs.existsSync(openResult.absolute_path));

  const searchResult = await engine.searchDocs({
    project_id: project.id,
    query: "adapter",
    top_k: 5
  });
  assert.ok(searchResult.results.length > 0);
  assert.ok(searchResult.results[0].snippet.length > 0);

  await engine.stop();

  const db = new Database(dbPath);
  const chunkRow = db
    .prepare("SELECT COUNT(*) as count FROM doc_chunks")
    .get() as { count: number };
  assert.ok(chunkRow.count > 0);
  const ftsRow = db
    .prepare("SELECT COUNT(*) as count FROM doc_chunks_fts")
    .get() as { count: number };
  assert.ok(ftsRow.count > 0);
  const migrationRows = db
    .prepare("SELECT id FROM schema_migrations ORDER BY id ASC")
    .all() as Array<{ id: string }>;
  assert.ok(migrationRows.some((row) => row.id === "0006"));
  db.close();

  const logger = new Logger("error");
  const dbForPlanner = openDatabase(dbPath, logger);
  const repos = createRepos(dbForPlanner);
  const docsService = new DocsService(repos, logger);
  const context = buildPlannerContext({
    project_id: project.id,
    message: { role: "user", content: "Find adapter docs" },
    mission: {
      mission_id: "mission-1",
      chat_id: "chat-1",
      objective: "Find adapter docs",
      scope_targets: ["docs"],
      created_at: new Date().toISOString()
    },
    project_root: projectRoot,
    repos,
    docs: docsService,
    registry: new EmptyAdapterRegistry()
  });
  assert.ok(context.retrieved_snippets.length > 0);
  dbForPlanner.close();
});
