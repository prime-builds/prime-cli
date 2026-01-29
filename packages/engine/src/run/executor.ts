import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type { Artifact, Run } from "../../../shared/src/contracts";
import type { AdapterRegistry } from "../adapters/registry";
import { AdapterNotFoundError, RunCanceledError, ValidationError } from "../errors";
import { Logger } from "../logger";
import type { DocsService } from "../docs";
import type { ArtifactsRepo } from "../storage/repos/artifacts";
import type { EvidenceRepo } from "../storage/repos/evidence";
import type { WorkflowStep } from "./workflow";
import type { AdapterArtifact, AdapterExecutionContext } from "../../../core/src/adapters";
import { getArtifactSchema, validateArtifactContent } from "../../../core/src/artifacts";

export interface StepExecutionContext {
  run: Run;
  step: WorkflowStep;
  project_id: string;
  project_root: string;
  chat_id?: string;
  available_artifacts: AdapterArtifact[];
  scope_targets?: string[];
  mission?: { objective: string; scope_targets: string[] };
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
  private readonly docs?: DocsService;
  private readonly parserRepairMode: "store_untrusted" | "off";

  constructor(
    artifactsDir: string,
    artifactsRepo: ArtifactsRepo,
    evidenceRepo: EvidenceRepo,
    registry: AdapterRegistry,
    logger: Logger,
    docs?: DocsService,
    parserRepairMode: "store_untrusted" | "off" = "store_untrusted"
  ) {
    this.artifactsDir = artifactsDir;
    this.artifactsRepo = artifactsRepo;
    this.evidenceRepo = evidenceRepo;
    this.registry = registry;
    this.logger = logger;
    this.docs = docs;
    this.parserRepairMode = parserRepairMode;
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
      project_id: context.project_id,
      mission: context.mission,
      docs_search: this.docs
        ? (input) =>
            this.docs.searchDocs({
              project_id: context.project_id,
              query: input.query,
              top_k: input.top_k,
              filter: input.filter
            })
        : undefined,
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
    const validationIssues: Array<{
      artifact: Artifact;
      errors: string[];
      raw_path?: string;
    }> = [];

    for (const [index, output] of result.artifacts.entries()) {
      const stored = this.persistArtifact(context, output, runDir, index);
      persistedArtifacts.push(stored);
      adapterArtifacts.push({
        type: output.type,
        path: stored.path,
        content_json: output.content_json
      });
      context.emitArtifact(stored, context.step.id);

      const schema = getArtifactSchema(output.type);
      if (output.content_json !== undefined) {
        const validationResult = validateArtifactContent(output.type, output.content_json);
        if (!validationResult.ok) {
          const errors = validationResult.errors.map((error) => `${output.type}: ${error}`);
          validationErrors.push(...errors);
          validationIssues.push({ artifact: stored, errors });
        }
        this.persistEvidenceFromArtifact(context, output.content_json, stored);
      } else if (schema) {
        const parsed = this.tryParseJson(stored.path);
        if (!parsed.ok) {
          const errors = [`${output.type}: ${parsed.error}`];
          validationErrors.push(...errors);
          validationIssues.push({ artifact: stored, errors, raw_path: stored.path });
        } else {
          const validationResult = validateArtifactContent(output.type, parsed.value);
          if (!validationResult.ok) {
            const errors = validationResult.errors.map((error) => `${output.type}: ${error}`);
            validationErrors.push(...errors);
            validationIssues.push({ artifact: stored, errors, raw_path: stored.path });
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      if (this.parserRepairMode === "store_untrusted") {
        for (const issue of validationIssues) {
          this.markArtifactUntrusted(context, issue.artifact, issue.errors, issue.raw_path);
        }
      }
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
      size_bytes: sizeBytes,
      trust_state: "trusted"
    });
  }

  private tryParseJson(filePath: string): { ok: true; value: unknown } | { ok: false; error: string } {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse JSON output";
      return { ok: false, error: message };
    }
  }

  private markArtifactUntrusted(
    context: StepExecutionContext,
    artifact: Artifact,
    errors: string[],
    rawPath?: string
  ): void {
    const updated = this.artifactsRepo.updateTrustState({
      id: artifact.id,
      trust_state: "untrusted"
    });

    const evidenceDir = resolveEvidenceDir(
      context.project_root,
      this.artifactsDir,
      context.run.id,
      context.step.id
    );
    fs.mkdirSync(evidenceDir, { recursive: true });
    const fileName = `parser-error-${artifact.id}.json`;
    const evidencePath = path.join(evidenceDir, fileName);
    const payload = {
      artifact_id: artifact.id,
      errors,
      raw_path: rawPath
    };
    fs.writeFileSync(evidencePath, JSON.stringify(payload, null, 2), "utf8");
    const buffer = fs.readFileSync(evidencePath);

    this.evidenceRepo.create({
      project_id: context.project_id,
      run_id: context.run.id,
      step_id: context.step.id,
      chat_id: context.chat_id,
      artifact_id: updated?.id ?? artifact.id,
      kind: "parser_error",
      path: evidencePath,
      description: errors.join("; "),
      hash: createHash("sha256").update(buffer).digest("hex"),
      media_type: "application/json",
      size_bytes: buffer.byteLength
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
  const params = step.params as { target_url?: unknown; target?: unknown };
  const targetUrl =
    typeof params.target_url === "string"
      ? params.target_url
      : typeof params.target === "string"
        ? params.target
        : undefined;
  if (!targetUrl) {
    return;
  }
  if (!scopeTargets || scopeTargets.length === 0) {
    throw new ValidationError("scope.targets is required when target is set");
  }
  if (!scopeTargets.includes(targetUrl)) {
    throw new ValidationError(`target must be one of scope.targets`);
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
  if (filePath.endsWith(".md")) {
    return "text/markdown";
  }
  return "application/octet-stream";
}
