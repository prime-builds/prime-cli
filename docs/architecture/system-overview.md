# System Overview

## Components
- Desktop UI: Local-first shell for projects, chats, runs, and artifacts. Presents run status and outputs.
- Engine: Deterministic orchestration process that executes workflows and emits run events.
- Planner: LLM-backed planner that transforms chat intent into a workflow DSL plan.
- Executor: Runtime that interprets the workflow DSL and invokes adapters in sequence.
- Adapter Registry: Catalog of available adapters and their capabilities for the executor.
- Artifact Store: Filesystem-backed store for run outputs, referenced by metadata.

## Data Flow
Chat → Planner → Workflow DSL → Engine → Artifacts → UI

## Relationships
- A Project contains multiple Chats and Runs.
- A Chat can create many ChatMessages and may spawn Runs.
- A Run contains ordered RunSteps that reference adapters from the registry.
- Artifacts are produced by RunSteps and linked back to the Run and (optionally) the Chat.

## Prompts
- Prompts live in the Planner layer as versioned templates.
- The UI sends chat context to the Planner, which uses prompts to generate a workflow DSL plan.
- The Engine does not execute prompts; it only executes the resulting workflow DSL deterministically.
