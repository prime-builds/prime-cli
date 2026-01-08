import paramsSchema from "./params.schema.json";
import webSurfaceSchema from "../../../../../core/src/artifacts/schemas/web_surface.schema.json";
import type { AdapterManifest } from "../../../../../core/src/adapters";

export const manifest: AdapterManifest = {
  id: "web.surface.discover.http",
  name: "Web Surface Discovery (HTTP)",
  description: "Discover surface URLs on a target site using passive HTTP GETs.",
  category: "web",
  risk_default: "passive",
  version: "1.0.0",
  inputs: [],
  outputs: ["web_surface.json"],
  params_schema: paramsSchema,
  artifact_schemas: {
    "web_surface.json": webSurfaceSchema
  }
};
