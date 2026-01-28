import paramsSchema from "./params.schema.json";
import findingsSchema from "../../../../../core/src/artifacts/schemas/findings_candidates.schema.json";
import type { AdapterManifest } from "../../../../../core/src/adapters";

export const manifest: AdapterManifest = {
  id: "findings.candidates.from_web_surface",
  name: "Findings Candidates from Web Surface",
  description: "Generate analysis candidates from web surface discovery artifacts.",
  category: "analysis",
  risk_default: "passive",
  version: "1.0.0",
  inputs: ["web_surface.json"],
  outputs: ["findings_candidates.json"],
  params_schema: paramsSchema,
  artifact_schemas: {
    "findings_candidates.json": findingsSchema
  }
};
