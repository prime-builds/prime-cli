import type { AdapterManifest } from "../../../../../core/src/adapters";

const manifest: AdapterManifest = {
  id: "web.linkgraph.build",
  name: "Web Link Graph Builder",
  description: "Build a link graph from web surface artifacts.",
  category: "web",
  risk_default: "passive",
  version: "1.0.0",
  inputs: ["web_surface.json"],
  outputs: ["link_graph.json"],
  params_schema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      max_edges: { type: "integer", minimum: 1, default: 2000 }
    }
  }
};

export default manifest;
