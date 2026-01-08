You are working in https://github.com/prime-builds/prime-cli.git

Current state:
- Engine skeleton (SQLite + IPC + RunEvents)
- MissionManifest, run fork/replay, artifact editing, provenance
- Adapter SDK + registry + discovery (builtin/local) with deterministic conflict resolution
- Adapter scaffolder + conformance suite + test harness + CI gates
- Planner gets capability summaries (no execution details)

Now we ship the first REAL capability with real execution -- safely and usefully.

DO NOT:
- Add UI
- Add containerization or policy engines
- Add "shell adapter" or free-form commands
- Implement anything exploit-y
- Overcomplicate with RAG/vector DB in this step

We want: simple, passive, high-signal, end-to-end working.

------------------------------------------------------------
GOAL
------------------------------------------------------------
Implement ONE real adapter category: "Web Surface Discovery"
that produces a correct normalized artifact from a target URL.

This must work with:
- workflow validation
- run events
- artifact chaining
- fork/replay/edit
- evidence storage
- parser + schema validation
- tests + fixtures

------------------------------------------------------------
A) Define Artifact Types + Schemas (Core)
------------------------------------------------------------
Add artifact type definitions + JSON Schemas in packages/core:

1) web_surface.json (output of discovery)
Schema must include:
- target: string
- timestamp: string
- urls: array of { url, method?, status?, content_type?, source }
- forms?: array (optional)
- links?: array (optional)
- notes?: array (optional)
- evidence?: array of { kind, path, description }

Keep it minimal but extensible.

Expose:
- packages/core/src/artifacts/types.ts
- packages/core/src/artifacts/schemas/web_surface.schema.json
- validator helpers for artifact schema validation

------------------------------------------------------------
B) Engine Artifact Validation Hook
------------------------------------------------------------
Update executor so that when an adapter emits an artifact with type X
and there is a schema for X, the engine validates it.
- If validation fails -> step fails deterministically with clear error.
- Store raw output/evidence for debugging even on failure.

------------------------------------------------------------
C) Implement Real Adapter: web.surface.discover.http
------------------------------------------------------------
Create a builtin adapter:
id: web.surface.discover.http
category: web
risk_default: passive
inputs: [] (or optional asset_inventory later)
outputs: ["web_surface.json"]

Params schema:
- target_url: string (must be one of scope.targets at runtime; executor enforces)
- max_depth: integer (default 1)
- max_pages: integer (default 25)
- timeout_sec: integer (default 10)
- user_agent?: string
- follow_redirects?: boolean

Execution:
- Use a simple HTTP client (node fetch) to request the target_url
- Parse HTML for links (<a href>, <form action>, script src, img src)
- Normalize discovered URLs (same origin only by default)
- Respect max_pages and max_depth (keep simple; BFS with queue)
- Save raw responses headers + a small sample body (capped) into evidence folder:
  evidence/<run_id>/<step_id>/...
- Produce web_surface.json artifact referencing evidence paths

NO crawling across domains by default.
Keep it passive: GET requests only.

------------------------------------------------------------
D) Workflow Planner Stub Upgrade (Minimal)
------------------------------------------------------------
Without calling external LLM:
- if adapter exists and user goal mentions web discovery/surface/urls,
  planner stub may output a 1-step workflow using web.surface.discover.http.
- Otherwise keep returning empty steps.

Planner must pick from capability summaries only.

------------------------------------------------------------
E) Run Integration + Evidence Storage
------------------------------------------------------------
Ensure:
- executor writes evidence files into project evidence folder under run/step
- artifacts written to artifacts/<run_id>/
- SQLite registers both artifact and evidence metadata (if you track evidence)
- events emitted:
  STEP_LOG (progress)
  ARTIFACT_WRITTEN (web_surface.json)
  STEP_FINISHED

Fork/replay:
- replay re-executes HTTP requests (deterministic as practical)
- fork can reuse the produced artifact from previous run if forking after that step

Artifact editing:
- editing web_surface.json works and is logged

------------------------------------------------------------
F) Tests (Mandatory)
------------------------------------------------------------
Create tests that run fully offline/reliably:
- Use a local in-test HTTP server (node http) serving a tiny HTML site with links/forms.
- Run the adapter against it.
- Assert:
  - artifact validates against schema
  - urls list contains expected links
  - evidence files written
  - events emitted in correct order
  - artifact is registered in SQLite

Also add:
- conformance fixtures for the adapter
- harness snapshot expected artifacts.json

------------------------------------------------------------
G) Documentation
------------------------------------------------------------
Update docs:
- docs/architecture/EXECUTION.md: add "Evidence and Raw Output"
- docs/architecture/ADAPTERS.md: add "Real Execution Adapter Example"
- docs/architecture/STORAGE.md: specify evidence folder usage

------------------------------------------------------------
H) Quality Bar
------------------------------------------------------------
This step is complete when:
- adapters:check PASS
- adapters:test PASS
- test:engine PASS
- end-to-end run produces a valid web_surface.json from a local test server
- evidence is stored and referenced
- fork/replay/edit remain functional

Commit in logical chunks.
