# Adapters

## Overview
Adapters encapsulate deterministic execution logic behind a stable manifest. The
planner selects adapters by capability; execution details remain private to the
engine and adapter runtime.

## Lifecycle
1. Planner emits workflow steps referencing adapter ids and params.
2. Engine resolves the adapter manifest and validates params/inputs.
3. Adapter executes and returns logs + artifacts.
4. Artifacts are persisted and become inputs for downstream steps.

## Discovery
Registry discovery is filesystem-based:
- Built-in adapters: `packages/engine/src/adapters/builtin/<id>/`
- Project-local adapters: `<ProjectRoot>/local_adapters/<id>/`

Local adapters override built-ins with the same id and can be added without
engine code changes.

## Precedence and Conflicts
If the same adapter id exists in both locations, the local adapter wins. The
registry records the conflict and emits a single deterministic warning for each
id. Conflicts and load errors are available via registry diagnostics and are
printed by `npm run adapters:check` and `npm run adapters:test`.

## Validation and Testing
- `npm run adapters:check` runs the conformance suite (manifest validity,
  schema strictness, inputs/outputs, artifact schemas).
- `npm run adapters:test` runs fixture-based adapter tests.
- `npm run adapter:test -- --id <adapterId>` runs a single adapter.

## Real Execution Adapter Example
The built-in `web.surface.discover.http` adapter performs passive HTTP surface
discovery and produces a `web_surface.json` artifact plus evidence references.

## Local Adapters
Place a local adapter under `<ProjectRoot>/local_adapters/<adapterId>/` with
`manifest.ts`, `adapter.ts`, and fixtures. The registry loads them dynamically,
and the conformance suite treats them the same as built-ins.
