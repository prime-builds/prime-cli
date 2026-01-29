import type { AdapterManifest } from "../../../../../core/src/adapters";

const manifest: AdapterManifest = {
  id: "report.export.html",
  name: "Report HTML Export",
  description: "Export report markdown to HTML.",
  category: "reporting",
  risk_default: "passive",
  version: "1.0.0",
  inputs: ["report.json"],
  outputs: ["report_export.json"],
  params_schema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      template: { type: "string", default: "default" },
      include_css: { type: "boolean", default: true }
    }
  }
};

export default manifest;
