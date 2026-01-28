import paramsSchema from "./params.schema.json";
import triageSchema from "../../../../../core/src/artifacts/schemas/findings_triaged.schema.json";
import type { AdapterManifest } from "../../../../../core/src/adapters";

export const manifest: AdapterManifest = {
  id: "findings.triage.rulebased",
  name: "Findings Triage (Rule-based)",
  description: "Apply deterministic triage rules to candidate findings.",
  category: "analysis",
  risk_default: "passive",
  version: "1.0.0",
  inputs: ["findings_candidates.json"],
  outputs: ["findings_triaged.json"],
  params_schema: paramsSchema,
  artifact_schemas: {
    "findings_triaged.json": triageSchema
  }
};
