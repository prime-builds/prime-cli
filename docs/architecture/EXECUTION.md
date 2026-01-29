
# Prime CLI - Execution Model

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

## Parser Repair Mode
If adapter output fails JSON parsing or schema validation:
- Raw output remains on disk
- Artifact is marked `untrusted`
- A `parser_error` evidence record is stored
- Runs fail fast to prevent propagating invalid artifacts

## Evidence and Raw Output
Executors may write raw evidence for debugging:
- Stored under `<ProjectRoot>/evidence/<run_id>/<step_id>/`
- Evidence metadata is registered in SQLite
- Evidence paths may be referenced from artifacts

## Run Forking & Replay
- Fork: create new run from previous step
- Replay: re-run identical workflow and inputs

## Provenance
Each run records:
- Planner prompt version
- Critic prompt version
- Latency and token estimates

## Findings Pipeline (Analysis-Only)
Prime CLI supports a deterministic analysis pipeline:
- `web_surface.json` -> `findings_candidates.json`
- `findings_candidates.json` -> `findings_triaged.json`
- `findings_triaged.json` -> `report.md` (with `report.json` metadata)

The pipeline produces candidate hypotheses, applies rule-based triage, and
generates a Markdown report with evidence references and optional KB citations.
