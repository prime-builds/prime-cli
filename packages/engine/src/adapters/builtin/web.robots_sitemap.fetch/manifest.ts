import type { AdapterManifest } from "../../../../../core/src/adapters";

const manifest: AdapterManifest = {
  id: "web.robots_sitemap.fetch",
  name: "Robots and Sitemap Fetch",
  description: "Fetch robots.txt and sitemap.xml for a target origin.",
  category: "web",
  risk_default: "passive",
  version: "1.0.0",
  inputs: [],
  outputs: ["robots_sitemap.json"],
  params_schema: {
    type: "object",
    additionalProperties: false,
    required: ["target_url"],
    properties: {
      target_url: { type: "string" },
      timeout_sec: { type: "integer", minimum: 1, default: 10 },
      follow_redirects: { type: "boolean", default: true }
    }
  }
};

export default manifest;
