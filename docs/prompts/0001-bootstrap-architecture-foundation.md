You are working inside the repository:
https://github.com/prime-builds/prime-cli.git

Context:
- This is a local-first, desktop (Electron) application.
- VS Code–style workspace model: Projects contain multiple Chats, Runs, Artifacts.
- No web/API product, no authentication, no SaaS concerns.
- LLM is a PLANNER only. Execution is deterministic via adapters.
- UI will come later. Right now we are locking architecture and contracts.

Your task is to bootstrap the project using enterprise-grade architecture patterns.

DO NOT:
- Build UI
- Implement adapters
- Add security bureaucracy or heavy guardrails
- Add mock features or demo logic

### STEP 1 — Architecture Decision Records (ADRs)
Create the following files under `docs/adr/`:

1) ADR-0001-monorepo-structure.md
   Decision: monorepo with `apps/desktop` and `packages/{shared,core,engine}`

2) ADR-0002-multiprocess-architecture.md
   Decision: Electron UI + separate Engine process communicating via IPC (not HTTP)

3) ADR-0003-storage-model.md
   Decision: SQLite for metadata/search + filesystem for artifacts

Each ADR should include:
- Context
- Decision
- Consequences
Keep them concise and professional.

---

### STEP 2 — Shared Contracts (MOST IMPORTANT)
Under `packages/shared/src/`, define TypeScript models for:

Entities:
- Project
- Chat
- ChatMessage
- Run
- RunStep
- Artifact

Run/Event model:
- RunEvent (union type)
  - RUN_STARTED
  - STEP_STARTED
  - STEP_LOG
  - ARTIFACT_WRITTEN
  - STEP_FINISHED
  - RUN_FINISHED
  - RUN_FAILED

IPC contracts:
- project.create / list / open
- chat.create / list / sendMessage
- run.start / cancel / events
- artifact.list / open

These must be **pure types/interfaces only**.
No implementation.

---

### STEP 3 — SQLite Schema (Initial)
Create `packages/engine/src/storage/schema.sql` defining tables for:

- projects
- chats
- chat_messages
- runs
- run_steps
- artifacts

Requirements:
- Use UUIDs or text IDs
- Include created_at timestamps
- Foreign keys where appropriate
- No premature indexing or optimization

---

### STEP 4 — Workflow DSL Schema
Under `packages/core/src/dsl/`, create:

- `schema.json` — JSON Schema for the Workflow DSL

The schema must support:
- workflow_id
- project_id
- chat_id
- scope.targets
- steps[]
  - id
  - adapter
  - category
  - risk
  - inputs
  - outputs
  - limits
  - params

No execution logic. Schema only.

---

### OUTPUT RULES
- Work only on a new branch.
- Commit logically (ADRs → shared → schema).
- Do not touch UI code.
- If something is unclear, make a reasonable engineering decision and document it.

Goal:
When finished, the repository should have a **locked, professional architecture foundation** that UI and engine work can safely build on.
