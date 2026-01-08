import paramsSchema from "./params.schema.json";
import type { AdapterManifest } from "../../../../../core/src/adapters";

export const manifest: AdapterManifest = {
  id: "file.extract.json",
  name: "File Extract JSON",
  description: "Extract and normalize JSON content from a local file.",
  category: "file",
  risk_default: "passive",
  version: "1.0.0",
  inputs: [],
  outputs: ["extracted_data.json"],
  params_schema: paramsSchema,
  artifact_schemas: {
    "extracted_data.json": {
      type: "object",
      additionalProperties: false,
      properties: {
        data: {}
      },
      required: ["data"]
    }
  }
};
