import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { Engine } from "../src/engine";
import { StaticAdapterRegistry } from "../src/adapters/registry";

function createTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prime-cli-${label}-`));
}

function openDb(dbPath: string): Database.Database {
  return new Database(dbPath);
}

function listEventTypes(db: Database.Database, runId: string): string[] {
  const rows = db
    .prepare("SELECT type FROM run_events WHERE run_id = ? ORDER BY created_at ASC")
    .all(runId) as Array<{ type: string }>;
  return rows.map((row) => row.type);
}

test("mission manifest is created and planner uses it", async () => {
  const tempDir = createTempDir("mission");
  const dbPath = path.join(tempDir, "engine.db");
  const engine = new Engine(
    {
      dbPath,
      artifactsDir: path.join(tempDir, "artifacts"),
      logLevel: "error"
    },
    {
      adapterRegistry: new StaticAdapterRegistry([
        { id: "dry-run-adapter", name: "Dry Run" }
      ])
    }
  );
  await engine.start();

  const { project } = await engine.createProject({
    name: "Mission Project",
    root_path: "/tmp/project"
  });
  const { chat } = await engine.createChat({ project_id: project.id, title: "Chat" });
  const { run } = await engine.sendMessage({
    chat_id: chat.id,
    message: {
      role: "user",
      content: "Summarize the repository",
      metadata: { scope_targets: ["docs"] }
    }
  });

  const { manifest } = await engine.getMission({ chat_id: chat.id });
  assert.ok(manifest);
  assert.equal(manifest?.objective, "Summarize the repository");
  assert.deepEqual(manifest?.scope_targets, ["docs"]);

  await engine.waitForRun(run.id);

  const db = openDb(dbPath);
  const row = db
    .prepare("SELECT workflow_json FROM runs WHERE id = ?")
    .get(run.id) as { workflow_json: string };
  const workflow = JSON.parse(row.workflow_json) as {
    scope: { targets: string[] };
    steps: Array<{ inputs: { mission: { objective: string } } }>;
  };
  assert.deepEqual(workflow.scope.targets, ["docs"]);
  assert.equal(workflow.steps[0].inputs.mission.objective, "Summarize the repository");
  db.close();

  await engine.stop();
});

test("artifact editing updates file, db, and emits event", async () => {
  const tempDir = createTempDir("artifact-edit");
  const dbPath = path.join(tempDir, "engine.db");
  const engine = new Engine(
    {
      dbPath,
      artifactsDir: path.join(tempDir, "artifacts"),
      logLevel: "error"
    },
    {
      adapterRegistry: new StaticAdapterRegistry([
        { id: "dry-run-adapter", name: "Dry Run" }
      ])
    }
  );
  await engine.start();

  const { project } = await engine.createProject({
    name: "Artifact Project",
    root_path: "/tmp/project"
  });
  const { chat } = await engine.createChat({ project_id: project.id, title: "Chat" });
  const { run } = await engine.sendMessage({
    chat_id: chat.id,
    message: { role: "user", content: "Generate artifact" }
  });

  await engine.waitForRun(run.id);
  const { artifacts } = await engine.listArtifacts({ run_id: run.id });
  assert.equal(artifacts.length, 1);
  const artifact = artifacts[0];
  const originalHash = artifact.hash;

  const updated = await engine.updateArtifact({
    artifact_id: artifact.id,
    new_content_json: { updated: true },
    reason: "Fix payload"
  });

  const updatedPayload = JSON.parse(fs.readFileSync(artifact.path, "utf8")) as {
    updated: boolean;
  };
  assert.equal(updatedPayload.updated, true);
  assert.notEqual(updated.artifact.hash, originalHash);

  const db = openDb(dbPath);
  const events = listEventTypes(db, run.id);
  assert.ok(events.includes("ARTIFACT_EDITED"));
  db.close();

  await engine.stop();
});

test("fork and replay preserve lineage, artifacts, and audit events", async () => {
  const tempDir = createTempDir("fork-replay");
  const dbPath = path.join(tempDir, "engine.db");
  const engine = new Engine(
    {
      dbPath,
      artifactsDir: path.join(tempDir, "artifacts"),
      logLevel: "error"
    },
    {
      adapterRegistry: new StaticAdapterRegistry([
        { id: "dry-run-adapter", name: "Dry Run" }
      ])
    }
  );
  await engine.start();

  const { project } = await engine.createProject({
    name: "Fork Project",
    root_path: "/tmp/project"
  });
  const { chat } = await engine.createChat({ project_id: project.id, title: "Chat" });

  const workflow = {
    workflow_id: "workflow-1",
    project_id: project.id,
    chat_id: chat.id,
    scope: { targets: [] as string[] },
    steps: ["step-1", "step-2", "step-3"].map((id) => ({
      id,
      adapter: "dry-run-adapter",
      category: "dry-run",
      risk: "low",
      inputs: {},
      outputs: {},
      limits: {},
      params: {}
    }))
  };

  const { run } = await engine.startRun({
    project_id: project.id,
    chat_id: chat.id,
    workflow_id: workflow.workflow_id,
    inputs: { workflow }
  });
  await engine.waitForRun(run.id);

  const forked = await engine.forkRun({
    run_id: run.id,
    step_id: "step-1"
  });
  await engine.waitForRun(forked.new_run_id);

  const replayed = await engine.replayRun({ run_id: run.id });
  await engine.waitForRun(replayed.new_run_id);

  const db = openDb(dbPath);
  const parentStepRow = db
    .prepare("SELECT id FROM run_steps WHERE run_id = ? AND step_id = ?")
    .get(run.id, "step-1") as { id: string };
  const forkRow = db
    .prepare(
      "SELECT parent_run_id, forked_from_step_id FROM runs WHERE id = ?"
    )
    .get(forked.new_run_id) as { parent_run_id: string; forked_from_step_id: string };
  assert.equal(forkRow.parent_run_id, run.id);
  assert.equal(forkRow.forked_from_step_id, parentStepRow.id);

  const forkArtifacts = db
    .prepare("SELECT name FROM artifacts WHERE run_id = ? ORDER BY name ASC")
    .all(forked.new_run_id) as Array<{ name: string }>;
  assert.deepEqual(
    forkArtifacts.map((row) => row.name),
    ["step-1-dry-run.json", "step-2-dry-run.json", "step-3-dry-run.json"]
  );

  const parentSteps = db
    .prepare("SELECT step_id FROM run_steps WHERE run_id = ? ORDER BY created_at ASC")
    .all(run.id) as Array<{ step_id: string }>;
  const replaySteps = db
    .prepare("SELECT step_id FROM run_steps WHERE run_id = ? ORDER BY created_at ASC")
    .all(replayed.new_run_id) as Array<{ step_id: string }>;
  assert.deepEqual(
    replaySteps.map((row) => row.step_id),
    parentSteps.map((row) => row.step_id)
  );

  const parentArtifacts = db
    .prepare("SELECT name, hash FROM artifacts WHERE run_id = ? ORDER BY name ASC")
    .all(run.id) as Array<{ name: string; hash: string }>;
  const replayArtifacts = db
    .prepare("SELECT name, hash FROM artifacts WHERE run_id = ? ORDER BY name ASC")
    .all(replayed.new_run_id) as Array<{ name: string; hash: string }>;
  assert.deepEqual(replayArtifacts, parentArtifacts);

  const forkEvents = listEventTypes(db, forked.new_run_id);
  const replayEvents = listEventTypes(db, replayed.new_run_id);
  assert.ok(forkEvents.includes("RUN_FORKED"));
  assert.ok(replayEvents.includes("RUN_REPLAYED"));

  db.close();

  await engine.stop();
});
