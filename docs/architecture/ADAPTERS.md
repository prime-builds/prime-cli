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
- Built-in adapters: `packages/engine/src/adapters/builtin/**`
- Project-local adapters: `<ProjectRoot>/local_adapters/**`

Local adapters override built-ins with the same id and can be added without
engine code changes.

## Validation and Testing
- `npm run adapters:check` runs the conformance suite (manifest validity,
  schema strictness, inputs/outputs, artifact schemas).
- `npm run adapters:test` runs fixture-based adapter tests.
- `npm run adapter:test -- --id <adapterId>` runs a single adapter.

## Local Adapters
Place a local adapter under `<ProjectRoot>/local_adapters/<adapterId>/` with
`manifest.ts`, `adapter.ts`, and fixtures. The registry loads them dynamically,
and the conformance suite treats them the same as built-ins.
