import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type { Artifact, Run } from "../../../shared/src/contracts";
import type { AdapterRegistry } from "../adapters/registry";
import { AdapterNotFoundError, RunCanceledError, ValidationError } from "../errors";
import { Logger } from "../logger";
import type { ArtifactsRepo } from "../storage/repos/artifacts";
import type { WorkflowStep } from "./workflow";
import type { AdapterArtifact } from "../../../core/src/adapters";

export interface StepExecutionContext {
  run: Run;
  step: WorkflowStep;
  project_id: string;
  project_root: string;
  chat_id?: string;
  available_artifacts: AdapterArtifact[];
  signal: AbortSignal;
  emitLog: (message: string, level?: "debug" | "info" | "warn" | "error") => void;
  emitArtifact: (artifact: Artifact, stepId: string) => void;
}

export interface StepExecutionResult {
  outputs: Record<string, unknown>;
  artifacts: Artifact[];
  adapter_artifacts: AdapterArtifact[];
}

export class Executor {
  private readonly artifactsDir: string;
  private readonly artifactsRepo: ArtifactsRepo;
  private readonly registry: AdapterRegistry;
  private readonly logger: Logger;

  constructor(
    artifactsDir: string,
    artifactsRepo: ArtifactsRepo,
    registry: AdapterRegistry,
    logger: Logger
  ) {
    this.artifactsDir = artifactsDir;
    this.artifactsRepo = artifactsRepo;
    this.registry = registry;
    this.logger = logger;
  }

  async executeStep(context: StepExecutionContext): Promise<StepExecutionResult> {
    if (context.signal.aborted) {
      throw new RunCanceledError();
    }

    const adapter = this.registry.getAdapter(context.step.adapter, context.project_root);
    if (!adapter) {
      throw new AdapterNotFoundError(context.step.adapter);
    }
    const validation = this.registry.validateStep(
      context.step,
      context.available_artifacts,
      context.project_root
    );
    if (!validation.ok) {
      throw new ValidationError(validation.errors.join("; "));
    }

    context.emitLog("dry-run started", "info");

    if (context.signal.aborted) {
      throw new RunCanceledError();
    }

    const runDir = path.resolve(this.artifactsDir, context.run.id);
    fs.mkdirSync(runDir, { recursive: true });

    const artifactName = `${context.step.id}-dry-run.json`;
    const artifactPath = path.join(runDir, artifactName);
    const payload = {
      workflow_id: context.run.workflow_id,
      step_id: context.step.id,
      adapter: adapter.manifest.id,
      dry_run: true
    };
    fs.writeFileSync(artifactPath, JSON.stringify(payload, null, 2), "utf8");

    const fileBuffer = fs.readFileSync(artifactPath);
    const hash = createHash("sha256").update(fileBuffer).digest("hex");
    const sizeBytes = fileBuffer.byteLength;

    const artifact = this.artifactsRepo.create({
      project_id: context.project_id,
      run_id: context.run.id,
      step_id: context.step.id,
      chat_id: context.chat_id,
      name: artifactName,
      hash,
      path: artifactPath,
      media_type: "application/json",
      size_bytes: sizeBytes
    });

    context.emitArtifact(artifact, context.step.id);
    context.emitLog("dry-run artifact written", "info");

    this.logger.debug("Dry-run step executed", {
      run_id: context.run.id,
      step_id: context.step.id
    });

    return {
      outputs: {
        artifacts: [{ id: artifact.id, name: artifact.name, path: artifact.path }]
      },
      artifacts: [artifact],
      adapter_artifacts: buildAdapterArtifacts(context.step)
    };
  }
}

function buildAdapterArtifacts(step: WorkflowStep): AdapterArtifact[] {
  if (!step.outputs || typeof step.outputs !== "object") {
    return [];
  }
  return Object.keys(step.outputs).map((type) => ({ type }));
}
