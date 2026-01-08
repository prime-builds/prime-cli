You are working in https://github.com/prime-builds/prime-cli.git
v2 Adapter Factory is implemented on main (commit dd8847c...).

Now we must “enterprise harden” the adapter platform so it scales cleanly:
- deterministic adapter resolution
- no duplicate IDs in planner context
- clear local adapter workflow
- CI quality gates
- planner-friendly adapter summaries (capability-level only)

DO NOT:
- build UI
- add security policy engines or containers
- implement real scanning tools
- expose execution details to planner

------------------------------------------------------------
A) Deterministic Adapter ID Conflict Handling (CRITICAL)
------------------------------------------------------------
Problem: same adapter id can appear in built-in + local sources; currently list shows duplicates.

Implement in FileSystemAdapterRegistry:
1) Each loaded adapter must carry a source descriptor:
   source: { kind: "builtin" | "local", path: string }
2) On duplicate adapter id:
   - Apply deterministic precedence: local > builtin
   - Keep ONLY the winning adapter in listAdapters()
   - Record a conflict entry in registry diagnostics:
     conflicts: [{ id, winner, losers[] }]
   - Emit a single warning log line (deterministic format)

Add API:
- registry.getDiagnostics(): { loadErrors[], conflicts[] }

Update conformance + testing CLIs to display conflicts at the end if any exist.

------------------------------------------------------------
B) Adapter Discovery Rules & Documentation
------------------------------------------------------------
Clarify and enforce these rules:
- Built-in adapters: packages/engine/src/adapters/builtin/<id>/
- Local adapters: <ProjectRoot>/local_adapters/<id>/
- Local overrides built-in

Add docs update:
- docs/architecture/ADAPTERS.md: add a “Precedence and Conflicts” section

------------------------------------------------------------
C) Scaffolder Improvements (Developer Ergonomics)
------------------------------------------------------------
Update adapter:new to support:
- --scope builtin|local  (default: local)
- --projectRoot <path>   (required for local unless can be inferred)
- --id, --category, --risk (existing)

Behavior:
- builtin: create under packages/engine/src/adapters/builtin/<id>/
- local: create under <ProjectRoot>/local_adapters/<id>/
- Print the created path + next commands to run

Ensure scaffolded local adapters are discoverable immediately by registry when projectRoot is set.

------------------------------------------------------------
D) Planner Capability Summaries (Big planning quality lift)
------------------------------------------------------------
Implement a capability-only adapter summary builder, used ONLY for planner context:
- Input: AdapterManifest + params.schema.json
- Output: small summary object:
  {
    id, name, category, description, risk_default,
    inputs, outputs,
    params_summary: [{name, type, required, enum?, description?}]
  }

Rules:
- Planner must never see execution templates, command lines, or parser code.
- It may see params schema field names/types/descriptions.

Wire it in packages/engine planner context:
- planner.ts must call registry.listAdapters() then convert to summaries.

------------------------------------------------------------
E) CI Quality Gates (Enterprise must-have)
------------------------------------------------------------
Add a GitHub Actions workflow:
- on push / PR:
  - npm ci
  - npm run adapters:check
  - npm run adapters:test
  - npm run test:engine (if stable)
Fail the workflow on any non-zero exit.

------------------------------------------------------------
F) Update Conformance Output (Optional but recommended)
------------------------------------------------------------
Improve adapters:check output to show:
- Adapter ID
- Status
- Source kind (builtin/local)
- Version
So reviewers can see what is being tested.

------------------------------------------------------------
G) Tests
------------------------------------------------------------
Add tests for:
1) Duplicate adapter id resolution:
   - create a builtin adapter fixture and a local adapter fixture with same id
   - assert local wins
   - assert conflicts recorded
2) adapter:new local scope:
   - scaffold to temp projectRoot/local_adapters
   - registry can discover it

------------------------------------------------------------
Deliverables:
- deterministic dedupe + diagnostics
- improved scaffolder workflow
- planner capability summaries
- CI workflow
- docs updated

Commit in logical chunks and ensure all scripts pass.
