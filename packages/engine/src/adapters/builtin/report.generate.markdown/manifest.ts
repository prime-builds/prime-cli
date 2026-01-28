import paramsSchema from "./params.schema.json";
import reportSchema from "../../../../../core/src/artifacts/schemas/report.schema.json";
import type { AdapterManifest } from "../../../../../core/src/adapters";

export const manifest: AdapterManifest = {
  id: "report.generate.markdown",
  name: "Report Generator (Markdown)",
  description: "Generate a deterministic markdown report from findings artifacts.",
  category: "reporting",
  risk_default: "passive",
  version: "1.0.0",
  inputs: ["web_surface.json", "findings_triaged.json"],
  outputs: ["report.json"],
  params_schema: paramsSchema,
  artifact_schemas: {
    "report.json": reportSchema
  }
};
