import fs from "fs";
import http from "http";
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

export type FixtureServer = {
  baseUrl: string;
  close: () => Promise<void>;
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
  const fixtureDir = path.join(adapter.source.path, "fixtures");
  const { params, artifacts, expectedArtifacts } = loadFixtures(fixtureDir);
  const prepared = await prepareFixtureParams(fixtureDir, params);
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "prime-adapter-"));
  const evidenceDir = path.join(artifactsDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const ctx: AdapterExecutionContext = {
    project_root: adapter.source.path,
    artifacts_dir: artifactsDir,
    evidence_dir: evidenceDir
  };
  try {
    const result = await runAdapter(
      registry,
      adapterId,
      prepared.params,
      artifacts,
      ctx
    );
    compareArtifacts(expectedArtifacts, result.artifacts);
  } finally {
    await prepared.cleanup?.();
  }
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

export async function prepareFixtureParams(
  fixtureDir: string,
  params: Record<string, unknown>
): Promise<{ params: Record<string, unknown>; cleanup?: () => Promise<void> }> {
  const siteDir = path.join(fixtureDir, "inputs", "site");
  if (!fs.existsSync(siteDir)) {
    return { params };
  }

  const server = await startFixtureServer(siteDir);
  const nextParams = { ...params };
  const targetValue = typeof nextParams.target_url === "string" ? nextParams.target_url : "";
  if (targetValue.includes("{{fixture_server_url}}")) {
    nextParams.target_url = targetValue.replace("{{fixture_server_url}}", server.baseUrl);
  } else if (!targetValue) {
    nextParams.target_url = `${server.baseUrl}/index.html`;
  }

  return { params: nextParams, cleanup: server.close };
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

async function startFixtureServer(siteDir: string): Promise<FixtureServer> {
  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const resolvedPath = safeJoin(siteDir, pathname === "/" ? "/index.html" : pathname);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const content = fs.readFileSync(resolvedPath);
    res.writeHead(200, { "Content-Type": guessContentType(resolvedPath) });
    res.end(content);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fixture server");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      })
  };
}

function safeJoin(root: string, requestPath: string): string | null {
  const resolved = path.resolve(root, `.${requestPath}`);
  if (!resolved.startsWith(path.resolve(root))) {
    return null;
  }
  return resolved;
}

function guessContentType(filePath: string): string {
  if (filePath.endsWith(".html")) {
    return "text/html";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript";
  }
  if (filePath.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}
