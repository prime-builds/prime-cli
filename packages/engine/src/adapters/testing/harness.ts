import fs from "fs";
import os from "os";
import path from "path";
import type {
  AdapterArtifact,
  AdapterExecutionContext,
  ExecutionResult
} from "../../../../core/src/adapters";
import { validateExecutionResult } from "../../../../core/src/adapters";
import type { AdapterRegistry } from "../registry";

export type AdapterFixture = {
  params: Record<string, unknown>;
  artifacts: AdapterArtifact[];
  expectedArtifacts: AdapterArtifact[];
};

export async function runAdapter(
  registry: AdapterRegistry,
  adapterId: string,
  params: Record<string, unknown>,
  inputArtifacts: AdapterArtifact[],
  ctx: AdapterExecutionContext
): Promise<ExecutionResult> {
  const adapter = registry.getAdapter(adapterId, ctx.project_root);
  if (!adapter) {
    throw new Error(`Adapter not found: ${adapterId}`);
  }

  const paramsResult = adapter.runtime.validateParams(params);
  if (!paramsResult.ok) {
    throw new Error(`Invalid params: ${paramsResult.errors.join("; ")}`);
  }
  const inputsResult = adapter.runtime.validateInputs(inputArtifacts);
  if (!inputsResult.ok) {
    throw new Error(`Invalid inputs: ${inputsResult.errors.join("; ")}`);
  }

  const result = await adapter.execute(params, inputArtifacts, ctx);
  const validation = validateExecutionResult(result, adapter.manifest);
  if (!validation.ok) {
    throw new Error(`Execution result invalid: ${validation.errors.join("; ")}`);
  }
  return result;
}

export async function runAdapterWithFixtures(
  registry: AdapterRegistry,
  adapterId: string,
  projectRoot?: string
): Promise<void> {
  const adapter = registry.getAdapter(adapterId, projectRoot);
  if (!adapter) {
    throw new Error(`Adapter not found: ${adapterId}`);
  }
  const fixtureDir = path.join(adapter.location, "fixtures");
  const { params, artifacts, expectedArtifacts } = loadFixtures(fixtureDir);
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "prime-adapter-"));
  const ctx: AdapterExecutionContext = {
    project_root: adapter.location,
    artifacts_dir: artifactsDir
  };
  const result = await runAdapter(registry, adapterId, params, artifacts, ctx);
  compareArtifacts(expectedArtifacts, result.artifacts);
}

export function loadFixtures(fixtureDir: string): AdapterFixture {
  const paramsPath = path.join(fixtureDir, "inputs", "params.json");
  const artifactsPath = path.join(fixtureDir, "inputs", "artifacts.json");
  const expectedPath = path.join(fixtureDir, "expected", "artifacts.json");

  const params = readJsonFile(paramsPath, {}) as Record<string, unknown>;
  const artifacts = readJsonFile(artifactsPath, []) as AdapterArtifact[];
  const expectedArtifacts = readJsonFile(expectedPath, []) as AdapterArtifact[];

  if (!Array.isArray(artifacts)) {
    throw new Error("fixtures/inputs/artifacts.json must be an array");
  }
  if (!Array.isArray(expectedArtifacts)) {
    throw new Error("fixtures/expected/artifacts.json must be an array");
  }

  return { params, artifacts, expectedArtifacts };
}

function readJsonFile(filePath: string, fallback: unknown): unknown {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function compareArtifacts(expected: AdapterArtifact[], actual: AdapterArtifact[]): void {
  const actualByType = new Map<string, AdapterArtifact>();
  for (const artifact of actual) {
    if (!actualByType.has(artifact.type)) {
      actualByType.set(artifact.type, artifact);
    }
  }

  const expectedTypes = expected.map((artifact) => artifact.type).sort();
  const actualTypes = Array.from(actualByType.keys()).sort();
  if (JSON.stringify(expectedTypes) !== JSON.stringify(actualTypes)) {
    throw new Error(
      `Artifact types mismatch. Expected ${expectedTypes.join(", ")} got ${actualTypes.join(", ")}`
    );
  }

  for (const expectedArtifact of expected) {
    const actualArtifact = actualByType.get(expectedArtifact.type);
    if (!actualArtifact) {
      throw new Error(`Missing artifact output: ${expectedArtifact.type}`);
    }
    if (expectedArtifact.content_json !== undefined) {
      assertDeepEqual(actualArtifact.content_json, expectedArtifact.content_json);
    }
    if (expectedArtifact.meta !== undefined) {
      assertDeepEqual(actualArtifact.meta, expectedArtifact.meta);
    }
    if (expectedArtifact.path !== undefined) {
      if (actualArtifact.path !== expectedArtifact.path) {
        throw new Error(
          `Artifact path mismatch for ${expectedArtifact.type}: expected ${expectedArtifact.path}`
        );
      }
    }
  }
}

function assertDeepEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Artifact content mismatch");
  }
}
