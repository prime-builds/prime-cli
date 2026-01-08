
# Prime CLI — Execution Model

## Engine Responsibilities
- Validate workflows against DSL schema
- Manage run lifecycle
- Execute steps deterministically
- Produce artifacts
- Emit audit events

## Workflow Execution
1. Planner proposes workflow
2. Critic validates
3. Run and steps persisted
4. Executor processes steps sequentially
5. Artifacts written and registered
6. Events streamed
7. Run finishes or fails

## Deterministic Executor
- Enforces limits
- Supports dry-run mode
- No free-form shell execution

## Artifact Editing
Humans may edit artifacts mid-run:
- Artifact file updated
- Hash recomputed
- ARTIFACT_EDITED event emitted

## Run Forking & Replay
- Fork: create new run from previous step
- Replay: re-run identical workflow and inputs

## Provenance
Each run records:
- Planner prompt version
- Critic prompt version
- Latency and token estimates
