import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { Engine } from "../src/engine";
import { validateArtifactContent } from "../../core/src/artifacts";

function createTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prime-cli-${label}-`));
}

function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const indexHtml = `<!doctype html>
  <html>
    <head>
      <title>Test</title>
      <script src="/app.js"></script>
    </head>
    <body>
      <a href="/about.html">About</a>
      <form action="/submit" method="post"></form>
      <img src="/logo.png" />
    </body>
  </html>`;

  const aboutHtml = `<!doctype html><html><body>About</body></html>`;

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(indexHtml);
      return;
    }
    if (req.url === "/about.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(aboutHtml);
      return;
    }
    if (req.url === "/app.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end("console.log('app');");
      return;
    }
    if (req.url === "/logo.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end("PNG");
      return;
    }
    if (req.url === "/submit") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to start server");
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => closeResolve());
          })
      });
    });
  });
}

function listEventTypes(db: Database.Database, runId: string): string[] {
  const rows = db
    .prepare("SELECT type FROM run_events WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId) as Array<{ type: string }>;
  return rows.map((row) => row.type);
}

test("web surface discovery adapter emits artifacts, evidence, and events", async () => {
  const tempDir = createTempDir("web-surface");
  const projectRoot = path.join(tempDir, "project");
  fs.mkdirSync(projectRoot, { recursive: true });

  const { baseUrl, close } = await startTestServer();
  const targetUrl = `${baseUrl}/index.html`;

  const engine = new Engine({
    dbPath: path.join(tempDir, "engine.db"),
    artifactsDir: path.join(tempDir, "artifacts"),
    logLevel: "error"
  });
  await engine.start();

  const { project } = await engine.createProject({
    name: "Web Project",
    root_path: projectRoot
  });
  const { chat } = await engine.createChat({ project_id: project.id, title: "Web Chat" });

  const workflow = {
    workflow_id: "workflow-web-surface",
    project_id: project.id,
    chat_id: chat.id,
    scope: { targets: [targetUrl] },
    steps: [
      {
        id: "step-1",
        adapter: "web.surface.discover.http",
        category: "web",
        risk: "passive",
        inputs: {},
        outputs: { "web_surface.json": {} },
        limits: {},
        params: {
          target_url: targetUrl,
          max_depth: 1,
          max_pages: 5,
          timeout_sec: 2
        }
      }
    ]
  };

  const { run } = await engine.startRun({
    project_id: project.id,
    chat_id: chat.id,
    workflow_id: workflow.workflow_id,
    inputs: { workflow }
  });

  await engine.waitForRun(run.id);

  const { artifacts } = await engine.listArtifacts({ run_id: run.id });
  assert.ok(artifacts.length > 0);
  const artifact = artifacts[0];
  const content = JSON.parse(fs.readFileSync(artifact.path, "utf8"));

  const validation = validateArtifactContent("web_surface.json", content);
  assert.ok(validation.ok, validation.errors.join("; "));
  assert.ok(
    content.urls.some((entry: { url: string }) => entry.url.endsWith("/about.html"))
  );

  const evidenceDir = path.join(projectRoot, "evidence", run.id, "step-1");
  assert.ok(fs.existsSync(evidenceDir));
  assert.ok(fs.readdirSync(evidenceDir).length > 0);

  const db = new Database(path.join(tempDir, "engine.db"));
  const evidenceRows = db
    .prepare("SELECT id FROM evidence WHERE run_id = ?")
    .all(run.id) as Array<{ id: string }>;
  assert.ok(evidenceRows.length > 0);

  const events = listEventTypes(db, run.id);
  const runStarted = events.indexOf("RUN_STARTED");
  const stepStarted = events.indexOf("STEP_STARTED");
  const artifactWritten = events.indexOf("ARTIFACT_WRITTEN");
  const stepFinished = events.indexOf("STEP_FINISHED");
  const runFinished = events.indexOf("RUN_FINISHED");
  assert.ok(runStarted !== -1);
  assert.ok(stepStarted !== -1);
  assert.ok(artifactWritten !== -1);
  assert.ok(stepFinished !== -1);
  assert.ok(runFinished !== -1);
  assert.ok(runStarted < stepStarted);
  assert.ok(stepStarted < artifactWritten);
  assert.ok(artifactWritten < stepFinished);
  assert.ok(stepFinished < runFinished);

  db.close();
  await engine.stop();
  await close();
});
