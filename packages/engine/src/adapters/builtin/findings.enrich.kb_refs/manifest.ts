import type { AdapterManifest } from "../../../../../core/src/adapters";

const manifest: AdapterManifest = {
  id: "findings.enrich.kb_refs",
  name: "Findings KB Ref Enrichment",
  description: "Attach KB snippet references to findings artifacts.",
  category: "analysis",
  risk_default: "passive",
  version: "1.0.0",
  inputs: ["findings_candidates.json", "findings_triaged.json"],
  outputs: ["findings_candidates.json", "findings_triaged.json"],
  params_schema: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      include_candidates: { type: "boolean", default: true },
      include_triaged: { type: "boolean", default: true },
      query_boost_terms: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
};

export default manifest;
