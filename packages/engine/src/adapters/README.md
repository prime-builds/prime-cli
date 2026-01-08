# Engine Adapters

This directory hosts the engine-side adapter runtime, discovery, and tooling.

## Registry and Discovery

The engine loads adapters from two locations, in priority order:

1) Built-ins: `packages/engine/src/adapters/builtin/**/`
2) Project-local: `<ProjectRoot>/local_adapters/**/`

Each adapter folder must export a `manifest` and `execute` implementation via
`manifest.ts` and `adapter.ts`. The registry validates manifests and params
schemas at load time and reports deterministic errors for invalid adapters.

## Conformance Suite

The conformance runner validates manifest correctness, strict params schemas,
input/output declarations, and fixture execution.

Run it with:

```bash
npm run adapters:check
```

## Test Harness and Fixtures

The harness runs adapters against fixtures:

- `fixtures/inputs/params.json`
- `fixtures/inputs/artifacts.json`
- `fixtures/expected/artifacts.json`

Run all adapter tests:

```bash
npm run adapters:test
```

Run a single adapter:

```bash
npm run adapter:test -- --id <adapterId>
```
