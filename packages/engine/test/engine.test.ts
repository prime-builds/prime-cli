import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Engine } from "../src/engine";
import { StaticAdapterRegistry } from "../src/adapters/registry";

function createTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prime-cli-${label}-`));
}

test("persists project, chat, and message", async () => {
  const tempDir = createTempDir("persist");
  const engine = new Engine({
    dbPath: path.join(tempDir, "engine.db"),
    artifactsDir: path.join(tempDir, "artifacts"),
    logLevel: "error"
  });
  await engine.start();

  const { project } = await engine.createProject({
    name: "Test Project",
    root_path: "/tmp/project"
  });
  const { chat } = await engine.createChat({ project_id: project.id, title: "Chat" });
  const { message } = await engine.sendMessage({
    chat_id: chat.id,
    message: { role: "assistant", content: "ack" }
  });

  assert.equal(message.chat_id, chat.id);
  await engine.stop();
});

test("run emits events in order and writes artifacts", async () => {
  const tempDir = createTempDir("run");
  const engine = new Engine(
    {
      dbPath: path.join(tempDir, "engine.db"),
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
    name: "Run Project",
    root_path: "/tmp/run-project"
  });
  const { chat } = await engine.createChat({ project_id: project.id, title: "Chat" });

  const { run } = await engine.sendMessage({
    chat_id: chat.id,
    message: { role: "user", content: "do a dry run" }
  });

  const events: string[] = [];
  engine.subscribeToRunEvents(run.id, (event) => events.push(event.type));

  await engine.waitForRun(run.id);

  assert.equal(events[0], "RUN_STARTED");
  assert.equal(events[1], "STEP_STARTED");
  assert.equal(events[events.length - 1], "RUN_FINISHED");
  assert.ok(events.includes("ARTIFACT_WRITTEN"));
  assert.ok(events.indexOf("STEP_LOG") > events.indexOf("STEP_STARTED"));
  assert.ok(events.indexOf("ARTIFACT_WRITTEN") > events.indexOf("STEP_LOG"));
  assert.ok(events.indexOf("STEP_FINISHED") > events.indexOf("ARTIFACT_WRITTEN"));
  assert.ok(events.indexOf("RUN_FINISHED") > events.indexOf("STEP_FINISHED"));

  const { artifacts } = await engine.listArtifacts({ run_id: run.id });
  assert.equal(artifacts.length, 1);
  assert.ok(fs.existsSync(artifacts[0].path));

  await engine.stop();
});
