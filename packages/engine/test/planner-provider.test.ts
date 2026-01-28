import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Engine } from "../src/engine";
import { EmptyAdapterRegistry } from "../src/adapters/registry";
import { Logger } from "../src/logger";
import { createRepos } from "../src/storage";
import { openDatabase } from "../src/storage/db";
import { DocsService } from "../src/docs";
import { PlannerService } from "../src/planner/service";
import type { PlannerProvider } from "../src/planner/types";

function createTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prime-cli-${label}-`));
}

test("planner provider fallback on invalid workflow", async () => {
  const tempDir = createTempDir("planner");
  const dbPath = path.join(tempDir, "engine.db");
  const logger = new Logger("error");
  const db = openDatabase(dbPath, logger);
  const repos = createRepos(db);
  const docs = new DocsService(repos, logger);

  const badProvider: PlannerProvider = {
    id: "bad.provider",
    name: "Bad Provider",
    plan: () => ({
      workflow_json: "not json",
      telemetry: { provider_id: "bad.provider" }
    })
  };

  const planner = new PlannerService({
    providers: [badProvider],
    registry: new EmptyAdapterRegistry(),
    docs,
    repos,
    logger,
    promptVersion: "planner-v1",
    selectedProviderId: "bad.provider",
    enableCritic: false
  });

  const { workflow, telemetry } = await planner.planForMessage({
    project_id: "proj",
    chat_id: "chat",
    message: { role: "user", content: "hello" },
    mission: {
      mission_id: "m1",
      chat_id: "chat",
      objective: "hello",
      scope_targets: [],
      created_at: new Date().toISOString()
    }
  });

  assert.equal(workflow.steps.length, 0);
  assert.equal(telemetry.provider_id, "bad.provider");
  db.close();
});

test("engine persists planner telemetry", async () => {
  const tempDir = createTempDir("telemetry");
  const dbPath = path.join(tempDir, "engine.db");
  const engine = new Engine(
    {
      dbPath,
      artifactsDir: path.join(tempDir, "artifacts"),
      logLevel: "error"
    },
    { adapterRegistry: new EmptyAdapterRegistry() }
  );
  await engine.start();
  const { project } = await engine.createProject({
    name: "Telemetry Project",
    root_path: path.join(tempDir, "project")
  });
  const { chat } = await engine.createChat({ project_id: project.id });

  const result = await engine.sendMessage({
    chat_id: chat.id,
    message: { role: "user", content: "status" }
  });
  assert.ok(result.run);
  const runs = await engine.listRuns({ chat_id: chat.id });
  const run = runs.runs[0];
  assert.equal(run.planner_provider_id, "local.heuristic");
  assert.equal(run.planner_model_name, "heuristic");
  assert.ok(run.planner_latency_ms !== undefined);
  await engine.stop();
});

test("provider selection falls back safely", async () => {
  const tempDir = createTempDir("provider");
  const dbPath = path.join(tempDir, "engine.db");
  const engine = new Engine(
    {
      dbPath,
      artifactsDir: path.join(tempDir, "artifacts"),
      logLevel: "error",
      plannerProvider: { id: "hosted.http" }
    },
    { adapterRegistry: new EmptyAdapterRegistry() }
  );
  await engine.start();
  const { project } = await engine.createProject({
    name: "Provider Project",
    root_path: path.join(tempDir, "project")
  });
  const { chat } = await engine.createChat({ project_id: project.id });

  const result = await engine.sendMessage({
    chat_id: chat.id,
    message: { role: "user", content: "status" }
  });
  assert.ok(result.run);
  const steps = await engine.listRunSteps({ run_id: result.run.id });
  assert.equal(steps.steps.length, 0);
  await engine.stop();
});
