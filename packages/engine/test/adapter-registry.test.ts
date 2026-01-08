import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FileSystemAdapterRegistry } from "../src/adapters/registry";
import { Logger } from "../src/logger";
import { createAdapterScaffold } from "../src/cli/adapter";

function createTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prime-cli-${label}-`));
}

function writeAdapter(dir: string, id: string, version: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = `module.exports.manifest = {
  id: "${id}",
  name: "Test Adapter",
  description: "Test adapter",
  category: "test",
  risk_default: "passive",
  version: "${version}",
  inputs: [],
  outputs: ["output.json"],
  params_schema: {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: []
  }
};
`;
  const adapter = `module.exports.execute = async () => ({ logs: [], artifacts: [] });
`;
  fs.writeFileSync(path.join(dir, "manifest.js"), manifest, "utf8");
  fs.writeFileSync(path.join(dir, "adapter.js"), adapter, "utf8");
}

test("registry resolves duplicate ids with local precedence", () => {
  const tempDir = createTempDir("registry");
  const builtinsDir = path.join(tempDir, "builtin");
  const projectRoot = path.join(tempDir, "project");
  fs.mkdirSync(builtinsDir, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });

  writeAdapter(path.join(builtinsDir, "dup.adapter"), "dup.adapter", "1.0.0");
  writeAdapter(
    path.join(projectRoot, "local_adapters", "dup.adapter"),
    "dup.adapter",
    "2.0.0"
  );

  const registry = new FileSystemAdapterRegistry({
    builtinsDir,
    logger: new Logger("error")
  });

  const manifests = registry.listAdapters(projectRoot);
  assert.equal(manifests.length, 1);
  assert.equal(manifests[0].id, "dup.adapter");

  const adapter = registry.getAdapter("dup.adapter", projectRoot);
  assert.ok(adapter);
  assert.equal(adapter?.source.kind, "local");
  assert.equal(adapter?.manifest.version, "2.0.0");

  const diagnostics = registry.getDiagnostics();
  assert.equal(diagnostics.conflicts.length, 1);
  assert.equal(diagnostics.conflicts[0].id, "dup.adapter");
  assert.equal(diagnostics.conflicts[0].winner.kind, "local");
});

test("adapter:new scaffolds local adapter discoverable by registry", () => {
  const tempDir = createTempDir("scaffold");
  const projectRoot = path.join(tempDir, "project");
  fs.mkdirSync(projectRoot, { recursive: true });
  const builtinsDir = path.join(tempDir, "builtin");
  fs.mkdirSync(builtinsDir, { recursive: true });

  const result = createAdapterScaffold({
    id: "demo.local",
    category: "demo",
    risk: "passive",
    scope: "local",
    projectRoot
  });

  assert.ok(fs.existsSync(path.join(result.baseDir, "manifest.ts")));

  const registry = new FileSystemAdapterRegistry({
    builtinsDir,
    logger: new Logger("error")
  });
  const manifests = registry.listAdapters(projectRoot);
  assert.equal(manifests.length, 1);
  assert.equal(manifests[0].id, "demo.local");
});
