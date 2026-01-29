import Ajv from "ajv/dist/2020";
import type { ArtifactSchemas, JSONSchema } from "./types";
import webSurfaceSchema from "./schemas/web_surface.schema.json";
import findingsCandidatesSchema from "./schemas/findings_candidates.schema.json";
import findingsTriagedSchema from "./schemas/findings_triaged.schema.json";
import reportSchema from "./schemas/report.schema.json";
import webHeadersSchema from "./schemas/web_headers.schema.json";
import robotsSitemapSchema from "./schemas/robots_sitemap.schema.json";
import linkGraphSchema from "./schemas/link_graph.schema.json";
import reportExportSchema from "./schemas/report_export.schema.json";

const ajv = new Ajv({ allErrors: true, strict: true });

const schemas: ArtifactSchemas = {
  "web_surface.json": webSurfaceSchema as JSONSchema,
  "web_headers.json": webHeadersSchema as JSONSchema,
  "robots_sitemap.json": robotsSitemapSchema as JSONSchema,
  "link_graph.json": linkGraphSchema as JSONSchema,
  "findings_candidates.json": findingsCandidatesSchema as JSONSchema,
  "findings_triaged.json": findingsTriagedSchema as JSONSchema,
  "report.json": reportSchema as JSONSchema,
  "report_export.json": reportExportSchema as JSONSchema
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
