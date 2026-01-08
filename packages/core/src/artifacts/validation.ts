import Ajv from "ajv/dist/2020";
import type { ArtifactSchemas, JSONSchema } from "./types";
import webSurfaceSchema from "./schemas/web_surface.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true });

const schemas: ArtifactSchemas = {
  "web_surface.json": webSurfaceSchema as JSONSchema
};

const validators = new Map<string, ReturnType<typeof ajv.compile>>();

export function getArtifactSchema(type: string): JSONSchema | undefined {
  return schemas[type];
}

export function validateArtifactContent(
  type: string,
  content: unknown
): { ok: boolean; errors: string[] } {
  const schema = getArtifactSchema(type);
  if (!schema) {
    return { ok: true, errors: [] };
  }
  let validator = validators.get(type);
  if (!validator) {
    validator = ajv.compile(schema);
    validators.set(type, validator);
  }
  const ok = validator(content);
  return { ok, errors: normalizeErrors(validator.errors) };
}

export function listArtifactSchemas(): ArtifactSchemas {
  return { ...schemas };
}

function normalizeErrors(errors?: Ajv.ErrorObject[] | null): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }
  return errors.map((error) => `${error.instancePath} ${error.message}`.trim());
}
