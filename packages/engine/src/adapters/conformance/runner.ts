import fs from "fs";
import path from "path";
import type { AdapterManifest } from "../../../../core/src/adapters";
import {
  isStrictParamsSchema,
  validateExecutionResult,
  validateManifest
} from "../../../../core/src/adapters";
import type { AdapterRegistry } from "../registry";
import { loadFixtures, prepareFixtureParams, runAdapter } from "../testing/harness";

export type ConformanceResult = {
  id: string;
  ok: boolean;
  errors: string[];
};

export async function runConformance(
  registry: AdapterRegistry,
  projectRoot: string,
  adapterIds?: string[]
): Promise<ConformanceResult[]> {
  const manifests = registry.listAdapters(projectRoot);
  const results: ConformanceResult[] = [];

  for (const manifest of manifests) {
    if (adapterIds && !adapterIds.includes(manifest.id)) {
      continue;
    }
    const errors: string[] = [];
    const manifestCheck = validateManifest(manifest);
    if (!manifestCheck.ok) {
      errors.push(...manifestCheck.errors);
    }

    const paramsCheck = isStrictParamsSchema(manifest.params_schema as Record<string, unknown>);
    if (!paramsCheck.ok) {
      errors.push(...paramsCheck.errors);
    }

    const ioCheck = validateIO(manifest);
    if (!ioCheck.ok) {
      errors.push(...ioCheck.errors);
    }

    const runtimeResult = registry.getAdapter(manifest.id, projectRoot);
    if (!runtimeResult) {
      errors.push("adapter not loadable");
    } else {
      const invalidParams = buildInvalidParams(manifest.params_schema);
      const paramsValidation = runtimeResult.runtime.validateParams(invalidParams);
      if (paramsValidation.ok) {
        errors.push("invalid params did not fail validation");
      }
      const inputValidation = runtimeResult.runtime.validateInputs([]);
      if (manifest.inputs.length > 0 && inputValidation.ok) {
        errors.push("missing inputs did not fail validation");
      }

      const fixtureDir = path.join(runtimeResult.source.path, "fixtures");
      if (fs.existsSync(fixtureDir)) {
        try {
          const fixtures = loadFixtures(fixtureDir);
          const prepared = await prepareFixtureParams(fixtureDir, fixtures.params);
          try {
            const evidenceDir = path.join(fixtureDir, "evidence");
            fs.mkdirSync(evidenceDir, { recursive: true });
            const result = await runAdapter(
              registry,
              manifest.id,
              prepared.params,
              fixtures.artifacts,
              {
                project_root: runtimeResult.source.path,
                artifacts_dir: path.join(fixtureDir, "artifacts"),
                evidence_dir: evidenceDir
              }
            );
            const executionCheck = validateExecutionResult(result, manifest);
            if (!executionCheck.ok) {
              errors.push(...executionCheck.errors);
            }
          } finally {
            await prepared.cleanup?.();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "fixture execution failed";
          errors.push(message);
        }
      } else {
        errors.push("missing fixtures directory");
      }
    }

    results.push({ id: manifest.id, ok: errors.length === 0, errors });
  }

  return results;
}

function validateIO(manifest: AdapterManifest): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (new Set(manifest.inputs).size !== manifest.inputs.length) {
    errors.push("inputs must be unique");
  }
  if (new Set(manifest.outputs).size !== manifest.outputs.length) {
    errors.push("outputs must be unique");
  }
  if (manifest.outputs.length === 0) {
    errors.push("outputs must not be empty");
  }
  return { ok: errors.length === 0, errors };
}

function buildInvalidParams(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === "object") {
    return { __invalid: true };
  }
  return { __invalid: true };
}
