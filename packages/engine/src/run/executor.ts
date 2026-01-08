import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type { Artifact, Run } from "../../../shared/src/contracts";
import type { AdapterRegistry } from "../adapters/registry";
import { AdapterNotFoundError, RunCanceledError, ValidationError } from "../errors";
import { Logger } from "../logger";
import type { ArtifactsRepo } from "../storage/repos/artifacts";
import type { EvidenceRepo } from "../storage/repos/evidence";
import type { WorkflowStep } from "./workflow";
import type { AdapterArtifact, AdapterExecutionContext } from "../../../core/src/adapters";
import { validateArtifactContent } from "../../../core/src/artifacts";

export interface StepExecutionContext {
  run: Run;
  step: WorkflowStep;
  project_id: string;
  project_root: string;
  chat_id?: string;
  available_artifacts: AdapterArtifact[];
  scope_targets?: string[];
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
  private readonly evidenceRepo: EvidenceRepo;
  private readonly registry: AdapterRegistry;
  private readonly logger: Logger;

  constructor(
    artifactsDir: string,
    artifactsRepo: ArtifactsRepo,
    evidenceRepo: EvidenceRepo,
    registry: AdapterRegistry,
    logger: Logger
  ) {
    this.artifactsDir = artifactsDir;
    this.artifactsRepo = artifactsRepo;
    this.evidenceRepo = evidenceRepo;
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

    enforceTargetScope(context.step, context.scope_targets);

    const validation = this.registry.validateStep(
      context.step,
      context.available_artifacts,
      context.project_root
    );
    if (!validation.ok) {
      throw new ValidationError(validation.errors.join("; "));
    }

    context.emitLog("adapter execution started", "info");

    if (context.signal.aborted) {
      throw new RunCanceledError();
    }

    const runDir = path.resolve(this.artifactsDir, context.run.id);
    fs.mkdirSync(runDir, { recursive: true });

    const evidenceDir = resolveEvidenceDir(context.project_root, this.artifactsDir, context.run.id, context.step.id);
    fs.mkdirSync(evidenceDir, { recursive: true });

    const adapterContext: AdapterExecutionContext = {
      project_root: context.project_root,
      artifacts_dir: runDir,
      evidence_dir: evidenceDir,
      run_id: context.run.id,
      step_id: context.step.id,
      signal: context.signal
    };

    const result = await adapter.execute(
      (context.step.params ?? {}) as Record<string, unknown>,
      context.available_artifacts,
      adapterContext
    );

    for (const log of result.logs ?? []) {
      context.emitLog(log.message, log.level);
    }

    const persistedArtifacts: Artifact[] = [];
    const adapterArtifacts: AdapterArtifact[] = [];
    const validationErrors: string[] = [];

    for (const [index, output] of result.artifacts.entries()) {
      const stored = this.persistArtifact(context, output, runDir, index);
      persistedArtifacts.push(stored);
      adapterArtifacts.push({ type: output.type });
      context.emitArtifact(stored, context.step.id);

      if (output.content_json !== undefined) {
        const validationResult = validateArtifactContent(output.type, output.content_json);
        if (!validationResult.ok) {
          validationErrors.push(
            `${output.type}: ${validationResult.errors.join("; ")}`
          );
        }
        this.persistEvidenceFromArtifact(context, output.content_json, stored);
      }
    }

    if (validationErrors.length > 0) {
      throw new ValidationError(validationErrors.join("; "));
    }

    this.logger.debug("Adapter step executed", {
      run_id: context.run.id,
      step_id: context.step.id
    });

    return {
      outputs: {
        artifacts: persistedArtifacts.map((artifact) => ({
          id: artifact.id,
          name: artifact.name,
          path: artifact.path
        }))
      },
      artifacts: persistedArtifacts,
      adapter_artifacts: adapterArtifacts
    };
  }

  private persistArtifact(
    context: StepExecutionContext,
    output: { type: string; path?: string; content_json?: unknown },
    runDir: string,
    index: number
  ): Artifact {
    let artifactPath = output.path;
    let mediaType: string | null = null;
    if (!artifactPath && output.content_json !== undefined) {
      const fileName = buildArtifactFileName(context.step.id, output.type, index);
      artifactPath = path.join(runDir, fileName);
      fs.writeFileSync(artifactPath, JSON.stringify(output.content_json, null, 2), "utf8");
      mediaType = "application/json";
    }
    if (!artifactPath) {
      throw new ValidationError(`Artifact ${output.type} is missing path or content_json`);
    }
    const resolvedPath = path.isAbsolute(artifactPath)
      ? artifactPath
      : path.resolve(context.project_root, artifactPath);

    const buffer = fs.readFileSync(resolvedPath);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const sizeBytes = buffer.byteLength;
    const name = path.basename(resolvedPath);

    return this.artifactsRepo.create({
      project_id: context.project_id,
      run_id: context.run.id,
      step_id: context.step.id,
      chat_id: context.chat_id,
      name,
      hash,
      path: resolvedPath,
      media_type: mediaType ?? guessMediaType(resolvedPath),
      size_bytes: sizeBytes
    });
  }

  private persistEvidenceFromArtifact(
    context: StepExecutionContext,
    content: unknown,
    artifact: Artifact
  ): void {
    if (!content || typeof content !== "object") {
      return;
    }
    const evidence = (content as { evidence?: unknown }).evidence;
    if (!Array.isArray(evidence)) {
      return;
    }

    for (const entry of evidence) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const kind = typeof (entry as { kind?: unknown }).kind === "string"
        ? (entry as { kind: string }).kind
        : undefined;
      const pathValue = typeof (entry as { path?: unknown }).path === "string"
        ? (entry as { path: string }).path
        : undefined;
      const description = typeof (entry as { description?: unknown }).description === "string"
        ? (entry as { description: string }).description
        : undefined;

      if (!kind || !pathValue) {
        continue;
      }

      const resolvedPath = path.isAbsolute(pathValue)
        ? pathValue
        : path.resolve(context.project_root, pathValue);

      if (!fs.existsSync(resolvedPath)) {
        this.logger.warn("Evidence file missing", { path: resolvedPath });
        continue;
      }

      const buffer = fs.readFileSync(resolvedPath);
      const hash = createHash("sha256").update(buffer).digest("hex");
      const sizeBytes = buffer.byteLength;

      this.evidenceRepo.create({
        project_id: context.project_id,
        run_id: context.run.id,
        step_id: context.step.id,
        chat_id: context.chat_id,
        artifact_id: artifact.id,
        kind,
        path: resolvedPath,
        description,
        hash,
        media_type: guessMediaType(resolvedPath),
        size_bytes: sizeBytes
      });
    }
  }
}

function enforceTargetScope(step: WorkflowStep, scopeTargets?: string[]): void {
  if (!step.params || typeof step.params !== "object") {
    return;
  }
  const targetUrl = (step.params as { target_url?: unknown }).target_url;
  if (typeof targetUrl !== "string") {
    return;
  }
  if (!scopeTargets || scopeTargets.length === 0) {
    throw new ValidationError("scope.targets is required when target_url is set");
  }
  if (!scopeTargets.includes(targetUrl)) {
    throw new ValidationError(`target_url must be one of scope.targets`);
  }
}

function resolveEvidenceDir(
  projectRoot: string,
  artifactsDir: string,
  runId: string,
  stepId: string
): string {
  if (projectRoot) {
    return path.resolve(projectRoot, "evidence", runId, stepId);
  }
  return path.resolve(artifactsDir, "evidence", runId, stepId);
}

function buildArtifactFileName(stepId: string, type: string, index: number): string {
  const safeType = type.replace(/[\\/]/g, "_");
  const suffix = index > 0 ? `-${index}` : "";
  return `${stepId}-${safeType}${suffix}`;
}

function guessMediaType(filePath: string): string {
  if (filePath.endsWith(".json")) {
    return "application/json";
  }
  if (filePath.endsWith(".txt")) {
    return "text/plain";
  }
  if (filePath.endsWith(".html")) {
    return "text/html";
  }
  return "application/octet-stream";
}
