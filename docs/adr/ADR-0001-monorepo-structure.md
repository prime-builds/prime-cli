# ADR-0001: Monorepo Structure

## Context
Prime CLI is a local-first desktop application with multiple layers (UI shell, core logic, engine, shared contracts). We want clear boundaries between these layers while keeping local development and refactors simple.

## Decision
Adopt a monorepo with `apps/desktop` and `packages/{shared,core,engine}`.

## Consequences
- Shared contracts and core logic are centralized and versioned together.
- Cross-package changes remain atomic, reducing integration drift.
- Tooling should support workspace-based builds and linting across packages.
