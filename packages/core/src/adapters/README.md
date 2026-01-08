# Adapter SDK

The Adapter SDK defines the manifest, runtime validation, and execution
contracts for Prime CLI adapters.

## Manifest Rules
- `id` must be namespaced (use dots).
- `version` must be semver.
- `params_schema` must be strict (`additionalProperties: false`).
- `inputs` and `outputs` list artifact types, not file names.

## Runtime Validation
Use `createAdapterRuntime(manifest)` to validate params and required inputs.

## Artifact Schemas
If `artifact_schemas` are provided, adapter outputs are validated against the
corresponding JSON Schema.
