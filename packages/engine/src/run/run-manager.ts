import type {
  Artifact,
  Run,
  RunEvent,
  RunStep,
  RunStepStatus
} from "../../../shared/src/contracts";
import { AdapterNotFoundError, EngineError, RunCanceledError } from "../errors";
import { Logger } from "../logger";
import type { StorageRepos } from "../storage";
import { nowIso } from "../utils/time";
import type { Executor } from "./executor";
import { RunEventHub } from "./event-hub";
import type { WorkflowDefinition, WorkflowStep } from "./workflow";

type RunTask = {
  controller: AbortController;
  promise: Promise<void>;
};

export class RunManager {
  private readonly repos: StorageRepos;
  private readonly executor: Executor;
  private readonly events: RunEventHub;
  private readonly logger: Logger;
  private readonly tasks = new Map<string, RunTask>();

  constructor(repos: StorageRepos, executor: Executor, events: RunEventHub, logger: Logger) {
    this.repos = repos;
    this.executor = executor;
    this.events = events;
    this.logger = logger;
  }

  startRun(input: {
    project_id: string;
    chat_id?: string;
    workflow: WorkflowDefinition;
  }): Run {
    const startedAt = nowIso();
    const run = this.repos.runs.create({
      project_id: input.project_id,
      chat_id: input.chat_id,
      workflow_id: input.workflow.workflow_id,
      status: "running",
      started_at: startedAt
    });

    const controller = new AbortController();
    const promise = new Promise<void>((resolve) => {
      setImmediate(() => {
        this.executeRun(run, input.workflow, controller.signal)
          .catch(() => undefined)
          .finally(() => resolve());
      });
    }).finally(() => {
      this.tasks.delete(run.id);
    });

    this.tasks.set(run.id, { controller, promise });
    return run;
  }

  cancelRun(runId: string): Run | null {
    const existing = this.repos.runs.getById(runId);
    if (!existing) {
      return null;
    }
    if (existing.status !== "running") {
      return existing;
    }
    const task = this.tasks.get(runId);
    if (task) {
      task.controller.abort();
    }
    return this.repos.runs.updateStatus(runId, "canceled", {
      finished_at: nowIso()
    });
  }

  async waitForRun(runId: string): Promise<void> {
    const task = this.tasks.get(runId);
    if (!task) {
      return;
    }
    await task.promise;
  }

  subscribe(runId: string, listener: (event: RunEvent) => void): () => void {
    return this.events.subscribe(runId, listener);
  }

  private async executeRun(
    run: Run,
    workflow: WorkflowDefinition,
    signal: AbortSignal
  ): Promise<void> {
    try {
      if (signal.aborted) {
        throw new RunCanceledError();
      }

      this.emit({
        type: "RUN_STARTED",
        run_id: run.id,
        workflow_id: run.workflow_id,
        timestamp: nowIso()
      });

      for (const step of workflow.steps) {
        if (signal.aborted) {
          throw new RunCanceledError();
        }

        const stepRow = this.repos.steps.create({
          run_id: run.id,
          step_id: step.id,
          status: "running",
          adapter: step.adapter,
          category: step.category,
          risk: step.risk,
          started_at: nowIso(),
          inputs: step.inputs,
          outputs: step.outputs,
          params: step.params
        });

        this.emit({
          type: "STEP_STARTED",
          run_id: run.id,
          step_id: step.id,
          timestamp: nowIso()
        });

        try {
          const result = await this.executor.executeStep({
            run,
            step,
            project_id: run.project_id,
            chat_id: run.chat_id,
            signal,
            emitLog: (message, level) => {
              this.emit({
                type: "STEP_LOG",
                run_id: run.id,
                step_id: step.id,
                message,
                level,
                timestamp: nowIso()
              });
            },
            emitArtifact: (artifact: Artifact, stepId: string) => {
              this.emit({
                type: "ARTIFACT_WRITTEN",
                run_id: run.id,
                artifact_id: artifact.id,
                step_id: stepId,
                timestamp: nowIso()
              });
            }
          });

          this.updateStep(stepRow, "succeeded", result.outputs);
          this.emit({
            type: "STEP_FINISHED",
            run_id: run.id,
            step_id: step.id,
            status: "succeeded",
            timestamp: nowIso()
          });
        } catch (error) {
          const status: RunStepStatus =
            error instanceof RunCanceledError ? "canceled" : "failed";
          this.updateStep(stepRow, status);
          this.emit({
            type: "STEP_FINISHED",
            run_id: run.id,
            step_id: step.id,
            status,
            timestamp: nowIso()
          });
          throw error;
        }
      }

      if (signal.aborted) {
        throw new RunCanceledError();
      }

      this.repos.runs.updateStatus(run.id, "succeeded", { finished_at: nowIso() });
      this.emit({
        type: "RUN_FINISHED",
        run_id: run.id,
        status: "succeeded",
        timestamp: nowIso()
      });
    } catch (error) {
      if (error instanceof RunCanceledError) {
        this.repos.runs.updateStatus(run.id, "canceled", { finished_at: nowIso() });
        this.emit({
          type: "RUN_FINISHED",
          run_id: run.id,
          status: "canceled",
          timestamp: nowIso()
        });
        return;
      }

      const message =
        error instanceof EngineError ? error.message : "Run failed unexpectedly";
      this.repos.runs.updateStatus(run.id, "failed", {
        finished_at: nowIso(),
        error: message
      });
      this.emit({
        type: "RUN_FAILED",
        run_id: run.id,
        error: message,
        timestamp: nowIso()
      });

      if (!(error instanceof AdapterNotFoundError)) {
        this.logger.error("Run failed", { run_id: run.id, error: message });
      }
    }
  }

  private updateStep(step: RunStep, status: RunStepStatus, outputs?: Record<string, unknown>): void {
    this.repos.steps.updateStatus(step.id, status, {
      finished_at: nowIso(),
      outputs
    });
  }

  private emit(event: RunEvent): void {
    this.events.emit(event);
  }
}
