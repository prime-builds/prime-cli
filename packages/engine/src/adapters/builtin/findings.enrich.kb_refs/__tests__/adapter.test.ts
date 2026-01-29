import assert from "node:assert/strict";
import { execute } from "../adapter";
import { validateArtifactContent } from "../../../../../core/src/artifacts";

const candidates = {
  target: "https://example.com",
  timestamp: "2025-01-01T00:00:00Z",
  source_artifacts: ["web_surface.json"],
  candidates: [
    {
      id: "cand_001",
      type: "missing_security_headers",
      title: "Missing headers",
      description: "Missing headers",
      evidence: [{ kind: "header", value: "missing" }],
      confidence: "medium",
      severity_hint: "medium",
      tags: ["headers"],
      refs: []
    }
  ]
};

const triaged = {
  target: "https://example.com",
  timestamp: "2025-01-01T00:00:00Z",
  source_artifacts: ["findings_candidates.json"],
  triaged: [
    {
      candidate_id: "cand_001",
      decision: "keep",
      severity: "medium",
      rationale: "Decision keep.",
      tags: ["headers"],
      refs: []
    }
  ],
  summary: { kept: 1, dropped: 0, needs_review: 0 }
};

test("findings.enrich.kb_refs emits schema-valid artifacts", async () => {
  const result = await execute(
    { include_candidates: true, include_triaged: true },
    [
      { type: "findings_candidates.json", content_json: candidates },
      { type: "findings_triaged.json", content_json: triaged }
    ],
    {
      project_root: process.cwd(),
      artifacts_dir: "./artifacts",
      docs_search: () => ({
        results: [
          { doc_id: "doc-1", chunk_id: "chunk-1", file_name: "kb.md" }
        ]
      })
    }
  );

  const candArtifact = result.artifacts.find((art) => art.type === "findings_candidates.json")?.content_json;
  const triArtifact = result.artifacts.find((art) => art.type === "findings_triaged.json")?.content_json;
  assert.ok(candArtifact && triArtifact);
  assert.ok(validateArtifactContent("findings_candidates.json", candArtifact).ok);
  assert.ok(validateArtifactContent("findings_triaged.json", triArtifact).ok);
});
