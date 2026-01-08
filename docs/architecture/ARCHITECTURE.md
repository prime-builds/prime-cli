
# Prime CLI — Architecture

## Overview
Prime CLI is a local-first, enterprise-grade desktop research platform built with a strict separation between **planning** (LLM-driven) and **execution** (deterministic engine).

The system follows a VS Code–style workspace model:
- Projects contain multiple Chats, Runs, and Artifacts
- The UI is a client over a long-running Engine process
- Execution is isolated from reasoning

## Core Components
- **Desktop UI (Electron Renderer)**: Displays projects, chats, runs, artifacts, and consoles.
- **Electron Main / Preload**: Typed IPC bridge with context isolation.
- **Engine Process (Node.js)**:
  - Planning orchestration
  - Workflow validation
  - Run lifecycle management
  - Artifact storage and indexing
- **Knowledge Base (Docs + FTS)**:
  - Imports project documentation into `<ProjectRoot>/docs/`
  - Extracts text and indexes chunks with SQLite FTS5
  - Supplies grounded snippets to the planner context

## Planning Model
- Planner outputs strict Workflow DSL JSON.
- Critic validates correctness and executability.
- Prompts are versioned assets under `docs/prompts/`.
- Planner context includes adapter capabilities, mission manifest, and retrieved doc snippets.

## Mission Manifest
Each Chat has a pinned Mission Manifest:
- Objective
- Scope targets
- Constraints and success criteria

The Mission Manifest is always injected into planning context.

## Run Lineage
Runs support:
- Forking (branching from a step)
- Replay (deterministic re-execution)
- Full lineage tracking

## Event-Driven Execution
The Engine emits a structured RunEvent stream consumed by the UI.
