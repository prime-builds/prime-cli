You are working in:
https://github.com/prime-builds/prime-cli.git

Current state:
- Architecture is locked (ARCHITECTURE/STORAGE/EXECUTION docs)
- Engine exists (SQLite + IPC + runs + events + dry-run executor)
- Mission manifest, run fork/replay, artifact editing, provenance exist
- Workflow DSL exists and is validated

Your mission:
Remove the biggest bottleneck: adapter development friction.

SDK alone is not enough. We need the “VS Code extension” experience:
- scaffolding
- validation
- conformance tests
- discoverability
- documentation generation
- local adapters without engine changes

Do not:
- Build UI
- Add containers, policy engines, or security bureaucracy
- Implement real scanning/exploit tools
- Hardcode tool-specific hacks

This is a platform ergonomics milestone.

------------------------------------------------------------
Target Outcome (Definition of Done)
------------------------------------------------------------

A developer can run one command to create a new adapter skeleton with:
- correct metadata
- params schema
- artifact IO contract
- tests + fixtures
- registration
- docs stub

And can run one command to validate + test all adapters.

No engine core changes required to add adapters.

------------------------------------------------------------
A) Adapter SDK (Formal, versioned, runtime-validated)
------------------------------------------------------------

Create the SDK under:
packages/core/src/adapters/

Deliverables:
1) Types/interfaces
2) Runtime validation (AJV preferred since you already use JSON Schema)
3) A strict execution result shape
4) Adapter manifest rules (id/version/compatibility)

Required interfaces:

AdapterManifest:
- id: string (namespaced, stable; e.g. "web.surface.discover")
- name: string
- description: string
- category: string
- risk_default: "passive" | "active" | "destructive"
- version: string (semver)
- inputs: string[]
- outputs: string[]
- params_schema: JSONSchema (strict; no free-form)
- artifact_schemas: optional mapping for each output artifact type to a JSON Schema
- tags?: string[]
- supported_platforms?: ("win32"|"darwin"|"linux")[]

AdapterRuntime:
- validateParams(params): {ok, errors[]}
- validateInputs(artifacts): {ok, errors[]}

AdapterExecution:
- execute(params, inputs, ctx) -> ExecutionResult

ExecutionResult:
- logs: Array<{level:"debug"|"info"|"warn"|"error", message:string, data?:any}>
- artifacts: Array<{type:string, path?:string, content_json?:any, meta?:object}>
- warnings?: string[]
- metrics?: {duration_ms?:number, counts?:Record<string,number>}

Rules:
- Planner never sees execution details.
- Engine uses manifest + schema to validate deterministically.
- Adapters do not reach into DB directly.

------------------------------------------------------------
B) Adapter Discovery + Registry (Production-ready)
------------------------------------------------------------

Implement registry in packages/engine/src/adapters/registry/

Discovery sources (priority order):
1) Built-in adapters:
   packages/engine/src/adapters/builtin/**/*
2) Project-local adapters folder:
   <ProjectRoot>/local_adapters/**/*

Requirements:
- Registry loads adapters dynamically
- Registry exposes:
  - listAdapters()
  - getAdapter(id)
  - validateStep(step, availableArtifacts)
  - resolveAdapterVersion(id, versionRange?) (keep simple; exact version ok for now)

If a local adapter fails validation:
- show deterministic error message
- it must not crash the engine

------------------------------------------------------------
C) Adapter Conformance Suite
------------------------------------------------------------

Create a conformance test runner:
packages/engine/src/adapters/conformance/

It must validate every adapter:
1) Manifest validity (required fields, semver)
2) Params schema is strict:
   - additionalProperties: false where reasonable
   - required fields declared
3) Inputs/outputs declared correctly
4) If artifact_schemas provided, produced artifacts must validate
5) Deterministic error behavior:
   - missing inputs must fail cleanly
   - invalid params must fail cleanly
6) No adapter can emit undeclared artifact types

Expose it via:
- a Node script and an npm script:
  - npm run adapters:check

Output:
- clear table-like summary (pass/fail per adapter)
- actionable error messages

------------------------------------------------------------
D) Adapter Test Harness + Fixtures
------------------------------------------------------------

Implement a harness:
packages/engine/src/adapters/testing/

Capabilities:
- runAdapter(adapterId, params, inputArtifacts, ctx)
- snapshot testing support:
  - fixtures/<adapterId>/inputs/*
  - fixtures/<adapterId>/expected/*
- failure test cases

Expose:
- npm run adapters:test (runs all adapter tests)
- npm run adapter:test -- --id <adapterId> (single adapter)

------------------------------------------------------------
E) Adapter Scaffolder
------------------------------------------------------------

Implement a scaffolding command (no UI):
packages/engine/src/cli/adapter.ts (or tools/scripts)

Command examples:
- npm run adapter:new -- --id web.surface.discover --category web --risk passive

It must generate:
- adapter folder with:
  - manifest.ts
  - params.schema.json
  - adapter.ts (execute stub)
  - parser.ts (optional stub)
  - README.md
  - __tests__/adapter.test.ts
  - fixtures/inputs + fixtures/expected
- auto-register in builtin registry index (or follow discovery conventions)

Goal:
Creating a new adapter should take minutes.

------------------------------------------------------------
F) Reference Adapter (Harmless, but fully compliant)
------------------------------------------------------------

Implement one reference adapter that demonstrates the entire workflow:

Example idea (safe):
- "file.extract.json"
  - reads a local JSON file from project docs/
  - outputs a normalized artifact like "extracted_data.json"

It must:
- declare inputs/outputs
- have params schema
- produce artifact with schema validation
- have fixtures + tests
- pass conformance suite

------------------------------------------------------------
G) Documentation
------------------------------------------------------------

Add:
1) docs/architecture/ADAPTERS.md
   - what adapters are
   - lifecycle
   - how discovery works
   - how to test and validate
   - how local_adapters works

2) packages/core/src/adapters/README.md
   - SDK usage
   - manifest rules
   - schema guidance
   - artifact schema guidance

3) packages/engine/src/adapters/README.md
   - registry + discovery
   - conformance suite
   - harness + fixtures

Also add README section in root README.md:
- “Adapters”
- link to ADAPTERS.md
- list npm scripts for scaffolding/checking/testing

------------------------------------------------------------
H) Quality Bar
------------------------------------------------------------

This work is complete only if:
- New adapter can be added without editing engine core logic
- npm run adapters:check validates all adapters
- npm run adapters:test runs fixtures-based tests
- Registry loads both built-in and project-local adapters
- Error paths are deterministic and well messaged
- Planner integration remains capability-level only (no execution details)

Commit in logical chunks:
1) SDK + types + validators
2) registry + discovery
3) conformance suite + harness
4) scaffolder
5) reference adapter + fixtures
6) docs + scripts
