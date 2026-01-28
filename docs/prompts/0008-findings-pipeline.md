You are working in https://github.com/prime-builds/prime-cli.git

Current state (already done):
- Engine: SQLite + IPC + runs + events + artifacts + fork/replay/edit + provenance
- Adapter platform: SDK + scaffolder + conformance + test harness + discovery + CI
- Knowledge Base: docs import + chunking + SQLite FTS search + planner-v1 prompt + planner context includes retrieved snippets

Now implement the FIRST “real value pipeline” that turns artifacts into actionable outputs.

Important constraints:
- This milestone is ANALYSIS-ONLY.
- Do NOT add exploit logic, payloads, or active attack steps.
- Do NOT add UI.
- Do NOT add containers/policy engines.
- Keep everything deterministic, schema-validated, testable.

------------------------------------------------------------
GOAL
------------------------------------------------------------
Deliver an end-to-end deterministic pipeline that can run locally:

web_surface.json
  -> findings_candidates.json
  -> findings_triaged.json
  -> report.md (+ evidence references)

Also: each finding should optionally include grounded citations from the local Knowledge Base
(doc snippets), so the report explains “why this matters” without guessing.

------------------------------------------------------------
A) Define Artifact Schemas (packages/core) — MUST
------------------------------------------------------------

Add these artifact schemas and register them in the core artifact schema map:

1) findings_candidates.json schema:
{
  "target": string,
  "timestamp": string,
  "source_artifacts": string[],      // e.g. ["web_surface.json"]
  "candidates": [
    {
      "id": string,                  // stable id within this run: "cand_001"
      "type": string,                // e.g. "missing_security_headers"
      "title": string,
      "description": string,
      "evidence": [
        { "kind": "url"|"header"|"html"|"text", "value": string, "path"?: string }
      ],
      "confidence": "low"|"medium"|"high",
      "severity_hint": "info"|"low"|"medium"|"high",
      "tags": string[],
      "refs": [
        { "source": "kb", "doc_id": string, "chunk_id": string, "label"?: string }
      ]
    }
  ]
}

2) findings_triaged.json schema:
{
  "target": string,
  "timestamp": string,
  "source_artifacts": string[],
  "triaged": [
    {
      "candidate_id": string,
      "decision": "keep"|"drop"|"needs_review",
      "severity": "info"|"low"|"medium"|"high",
      "rationale": string,
      "tags": string[],
      "refs": [...]
    }
  ],
  "summary": {
    "kept": number,
    "dropped": number,
    "needs_review": number
  }
}

3) report.md is a file artifact, but create a report metadata JSON schema optionally:
report.json:
{
  "target": string,
  "timestamp": string,
  "artifacts": string[],
  "report_path": string
}

Keep schemas minimal but strict. Ensure engine artifact validation enforces these.

------------------------------------------------------------
B) Implement Adapter 1: findings.candidates.from_web_surface (builtin)
------------------------------------------------------------

Adapter:
- id: findings.candidates.from_web_surface
- category: analysis
- risk_default: passive
- inputs: ["web_surface.json"]
- outputs: ["findings_candidates.json"]

Params schema (strict):
- target: string (must match scope.targets at runtime)
- ruleset: "baseline" (string enum; future extensible)
- max_candidates: integer (default 50)
- include_kb_refs: boolean (default true)
- kb_query_boost_terms?: string[] (optional)

Execution logic (deterministic rules only):
Generate candidates from web_surface.json using a baseline ruleset, examples:
- Missing common security headers (only if headers captured in evidence; if not available, skip)
- Mixed content links (http resources on https pages)
- Forms detected (login/password fields) -> “authentication surface present”
- Admin-like paths discovered (/admin, /dashboard, /manage) -> “sensitive endpoint discovered” (NOT a vuln claim)
- Potential directory listing indicators (only if evidence supports)
- Exposure hints: robots.txt / sitemap.xml links discovered
- Large JS surface (many script src) -> “client-side surface large”

Important: output is “candidate findings / hypotheses”, not definitive vulns.

Grounding (KB refs):
If include_kb_refs is true:
- Use the local docs.search API to retrieve top snippets relevant to each candidate type
  (query like: "<candidate.type> security header explanation", plus any kb_query_boost_terms)
- Attach refs: {doc_id, chunk_id}
Do NOT paste full snippets into the artifact; keep refs only.

Evidence:
- Include concrete URLs and any evidence paths produced by web_surface step.

------------------------------------------------------------
C) Implement Adapter 2: findings.triage.rulebased (builtin)
------------------------------------------------------------

Adapter:
- id: findings.triage.rulebased
- category: analysis
- risk_default: passive
- inputs: ["findings_candidates.json"]
- outputs: ["findings_triaged.json"]

Params schema:
- triage_mode: "conservative"|"balanced" (default balanced)
- keep_threshold: enum mapping confidence/severity_hint to decisions
- max_kept: integer default 30

Logic:
- Deterministically decide keep/drop/needs_review
- Set severity based on confidence + severity_hint + tags
- Add rationale text that is short and factual (no claims beyond evidence)

This is a quality filter, not an oracle.

------------------------------------------------------------
D) Implement Adapter 3: report.generate.markdown (builtin)
------------------------------------------------------------

Adapter:
- id: report.generate.markdown
- category: reporting
- risk_default: passive
- inputs: ["web_surface.json", "findings_triaged.json"] (allow optional candidates too)
- outputs: ["report.json"] plus writes report.md to reports/<run_id>/report.md

Params schema:
- template: "default"
- include_evidence_links: boolean default true
- include_kb_citations: boolean default true

Report structure (Markdown):
- Title + target + timestamp
- Mission objective (from MissionManifest)
- Summary (counts by severity/decision)
- Key findings (kept + needs_review)
  - each with evidence (URLs, paths)
  - if include_kb_citations: list KB refs (doc_id/chunk_id + file_name label)
- Appendix: artifacts list + run metadata/provenance

Write report.md to disk and output report.json pointing to report path.
Register report as artifact in SQLite (type report.json + file path for md).

------------------------------------------------------------
E) Planner Upgrade (still safe, capability-only)
------------------------------------------------------------

Update the planner stub behavior (no external model required):
If user asks for “assessment / analyze / find issues / report” AND required adapters exist,
produce a 3-step workflow:
1) web.surface.discover.http  (if present; otherwise skip)
2) findings.candidates.from_web_surface
3) findings.triage.rulebased
4) report.generate.markdown

Keep max steps per plan rule if you enforce it; if so, plan in two batches:
- first batch: discovery + candidates
- second batch: triage + report

Use KB snippets in planner context but never expose execution details.

------------------------------------------------------------
F) Engine: Ensure Evidence + Artifact Validation Works
------------------------------------------------------------
- Validate all produced JSON artifacts against schemas
- If a schema validation fails:
  - fail step deterministically
  - store debug evidence/logs
- Ensure artifact editing works for findings + report metadata
- Ensure fork/replay still works:
  - fork after candidates should reuse artifacts up to that step
  - replay should regenerate outputs deterministically given same inputs

------------------------------------------------------------
G) Tests (Mandatory)
------------------------------------------------------------

Create deterministic offline tests:
1) Use a fixture web_surface.json with known URLs/forms/headers markers
2) Run candidates adapter:
   - validate findings_candidates.json schema
   - assert candidate count and certain candidate types appear
3) Run triage adapter:
   - validate findings_triaged.json
   - assert summary counts stable
4) Run report adapter:
   - report.md exists
   - report.json points to it
   - includes mission objective and findings table
5) If include_kb_refs enabled:
   - import a small doc into KB during test
   - ensure refs are attached (doc_id/chunk_id)

Also update conformance fixtures for all 3 adapters.

------------------------------------------------------------
H) Documentation
------------------------------------------------------------
Update docs:
- EXECUTION.md: add “Findings Pipeline (analysis-only)”
- ADAPTERS.md: list these adapters and their artifact IO
- STORAGE.md: specify reports folder layout and report registration

Commit in logical chunks and ensure:
- npm run adapters:check PASS
- npm run adapters:test PASS
- npm run test:engine PASS
- CI passes
