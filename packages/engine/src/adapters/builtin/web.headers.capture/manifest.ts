import type { AdapterManifest } from "../../../../../core/src/adapters";

const manifest: AdapterManifest = {
  id: "web.headers.capture",
  name: "Web Headers Capture",
  description: "Capture response headers for a target URL.",
  category: "web",
  risk_default: "passive",
  version: "1.0.0",
  inputs: [],
  outputs: ["web_headers.json"],
  params_schema: {
    type: "object",
    additionalProperties: false,
    required: ["target_url"],
    properties: {
      target_url: { type: "string" },
      timeout_sec: { type: "integer", minimum: 1, default: 10 },
      user_agent: { type: "string" },
      follow_redirects: { type: "boolean", default: true }
    }
  }
};

export default manifest;
