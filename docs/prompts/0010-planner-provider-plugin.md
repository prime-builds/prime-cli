# Prompt — M8 Planner Provider Plugin (Real Model, Still DSL-only)

```text
You are working in https://github.com/prime-builds/prime-cli.git

Goal:
Replace the planner stub with a **Planner Provider plugin system** while preserving:
- strict Workflow DSL output (JSON-only)
- deterministic validation and execution
- grounded context via KB snippets
- run provenance/telemetry

DO NOT:
- allow the model to execute tools or output shell commands
- add UI work in this milestone

A) Provider Interface
Define PlannerProvider:
- id, name
- configure(settings)
- plan(context) -> { workflow_json, telemetry }
- optional critic(context, workflow_json) -> { ok, issues[] }

Context includes:
- MissionManifest + scope.targets
- adapter capability summaries
- current artifacts
- retrieved KB snippets (FTS results)

Telemetry includes:
- provider_id, model_name, prompt_version, latency_ms
- tokens_in/tokens_out (if available)

B) Engine Integration
- Select provider via config
- Assemble context deterministically on chat.sendMessage
- Call plan -> validate DSL schema + semantic checks
- Optionally run critic pass (deterministic or provider)
- Persist run + telemetry to SQLite
- Provider failures must fall back to steps:[] without crashing

C) Baseline Local Provider
Implement a no-network provider that uses deterministic heuristics for tests.

D) Optional Hosted Provider (behind config, disabled by default)
Must enforce JSON-only output and never permit raw commands.

E) Planning Regression Harness
Add npm script: npm run planner:eval
Feed saved contexts, assert DSL validity, track drift.

F) Tests
Provider selection + fallback, telemetry persistence, schema rejection, eval fixtures.

Commit in logical chunks.
```
