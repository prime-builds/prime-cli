import Ajv from "ajv/dist/2020";
import type { AdapterArtifact, AdapterManifest, AdapterRuntime, ExecutionResult } from "./types";

const ajv = new Ajv({ allErrors: true, strict: true });

function normalizeErrors(errors?: Ajv.ErrorObject[] | null): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }
  return errors.map((error) => `${error.instancePath} ${error.message}`.trim());
}

export function validateManifest(manifest: AdapterManifest): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest.id.includes(".")) {
    errors.push("id must be namespaced (use dots)");
  }
  if (!isSemver(manifest.version)) {
    errors.push("version must be semver (x.y.z)");
  }
  if (manifest.inputs.some((entry) => entry.trim().length === 0)) {
    errors.push("inputs must not be empty");
  }
  if (manifest.outputs.some((entry) => entry.trim().length === 0)) {
    errors.push("outputs must not be empty");
  }
  return { ok: errors.length === 0, errors };
}

export function createAdapterRuntime(manifest: AdapterManifest): AdapterRuntime {
  const paramsValidator = ajv.compile<Record<string, unknown>>(manifest.params_schema);
  return {
    validateParams: (params) => {
      const ok = paramsValidator(params);
      return { ok, errors: normalizeErrors(paramsValidator.errors) };
    },
    validateInputs: (artifacts) => {
      const missing = manifest.inputs.filter(
        (requiredType) => !artifacts.some((artifact) => artifact.type === requiredType)
      );
      if (missing.length > 0) {
        return {
          ok: false,
          errors: missing.map((type) => `missing input artifact: ${type}`)
        };
      }
      return { ok: true, errors: [] };
    }
  };
}

export function validateExecutionResult(
  result: ExecutionResult,
  manifest: AdapterManifest
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const log of result.logs) {
    if (!log.level || !log.message) {
      errors.push("log entries must include level and message");
      break;
    }
  }

  const allowedOutputs = new Set(manifest.outputs);
  for (const artifact of result.artifacts) {
    if (!allowedOutputs.has(artifact.type)) {
      errors.push(`undeclared artifact type: ${artifact.type}`);
    }
    if (artifact.content_json && manifest.artifact_schemas?.[artifact.type]) {
      const schema = manifest.artifact_schemas[artifact.type];
      const validator = ajv.compile(schema);
      const ok = validator(artifact.content_json);
      if (!ok) {
        errors.push(
          `artifact schema validation failed for ${artifact.type}: ${normalizeErrors(
            validator.errors
          ).join("; ")}`
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function isStrictParamsSchema(schema: Record<string, unknown>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const additional = schema.additionalProperties;
  if (additional !== false) {
    errors.push("params_schema.additionalProperties must be false");
  }
  if (!Array.isArray(schema.required)) {
    errors.push("params_schema.required must be an array");
  }
  return { ok: errors.length === 0, errors };
}

function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(value);
}
