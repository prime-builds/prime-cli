import type { AdapterManifest, JSONSchema } from "../../../core/src/adapters";

export type AdapterParamSummary = {
  name: string;
  type: string;
  required: boolean;
  enum?: unknown[];
  description?: string;
};

export type AdapterSummary = {
  id: string;
  name: string;
  category: string;
  description: string;
  risk_default: AdapterManifest["risk_default"];
  inputs: string[];
  outputs: string[];
  params_summary: AdapterParamSummary[];
};

export function buildAdapterSummaries(manifests: AdapterManifest[]): AdapterSummary[] {
  return manifests.map((manifest) => buildAdapterSummary(manifest));
}

export function buildAdapterSummary(manifest: AdapterManifest): AdapterSummary {
  const schema = manifest.params_schema as JSONSchema;
  const params_summary = summarizeParams(schema);
  return {
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    description: manifest.description,
    risk_default: manifest.risk_default,
    inputs: manifest.inputs,
    outputs: manifest.outputs,
    params_summary
  };
}

function summarizeParams(schema: JSONSchema): AdapterParamSummary[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  const requiredList = Array.isArray(schema.required)
    ? (schema.required as string[])
    : [];
  const required = new Set(requiredList);
  const properties =
    schema && typeof schema === "object" && schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, JSONSchema>)
      : {};

  return Object.entries(properties).map(([name, definition]) => ({
    name,
    type: resolveParamType(definition),
    required: required.has(name),
    enum: Array.isArray(definition.enum) ? definition.enum : undefined,
    description: typeof definition.description === "string" ? definition.description : undefined
  }));
}

function resolveParamType(definition: JSONSchema): string {
  if (!definition || typeof definition !== "object") {
    return "unknown";
  }
  const value = definition.type;
  if (Array.isArray(value)) {
    return value.join("|");
  }
  if (typeof value === "string") {
    return value;
  }
  return "unknown";
}
