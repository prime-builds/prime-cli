import fs from "fs";
import path from "path";
import type {
  AdapterExecution,
  AdapterLogEntry,
  AdapterExecutionContext
} from "../../../../../core/src/adapters";
import type {
  FindingsCandidatesArtifact,
  FindingsTriagedArtifact,
  TriagedFinding
} from "../../../../../core/src/artifacts";

type Decision = "keep" | "drop" | "needs_review";
type Severity = "info" | "low" | "medium" | "high";
type Confidence = "low" | "medium" | "high";

export const execute: AdapterExecution["execute"] = async (params, inputs, ctx) => {
  const triageMode = (params.triage_mode as string) ?? "balanced";
  const maxKept = normalizeInt(params.max_kept, 30, 1);
  const keepThreshold = isObject(params.keep_threshold)
    ? (params.keep_threshold as Record<string, Decision>)
    : undefined;

  const candidates = loadInput<FindingsCandidatesArtifact>(
    inputs,
    "findings_candidates.json",
    ctx
  );

  const triaged: TriagedFinding[] = candidates.candidates.map((candidate) => {
    const base = resolveBaseDecision(candidate.severity_hint, triageMode, keepThreshold);
    const decision = adjustDecision(base, candidate.confidence);
    return {
      candidate_id: candidate.id,
      decision,
      severity: resolveSeverity(candidate.severity_hint, candidate.confidence),
      rationale: buildRationale(candidate.severity_hint, candidate.confidence, decision),
      tags: [...candidate.tags],
      refs: candidate.refs
    };
  });

  const kept = triaged.filter((entry) => entry.decision === "keep");
  if (kept.length > maxKept) {
    const ordered = sortBySeverityAndConfidence(candidates.candidates);
    const allowed = new Set(
      ordered.slice(0, maxKept).map((candidate) => candidate.id)
    );
    for (const entry of triaged) {
      if (entry.decision === "keep" && !allowed.has(entry.candidate_id)) {
        entry.decision = "needs_review";
        entry.rationale = `${entry.rationale} Limited by max_kept.`;
      }
    }
  }

  const summary = summarize(triaged);
  const artifact: FindingsTriagedArtifact = {
    target: candidates.target,
    timestamp: new Date().toISOString(),
    source_artifacts: ["findings_candidates.json"],
    triaged,
    summary
  };

  const logs: AdapterLogEntry[] = [
    {
      level: "info",
      message: "triage complete",
      data: summary
    }
  ];

  return {
    logs,
    artifacts: [
      {
        type: "findings_triaged.json",
        content_json: artifact
      }
    ]
  };
};

function loadInput<T>(
  inputs: Array<{ type: string; content_json?: unknown; path?: string }>,
  type: string,
  ctx: AdapterExecutionContext
): T {
  const artifact = inputs.find((entry) => entry.type === type);
  if (!artifact) {
    throw new Error(`missing input artifact: ${type}`);
  }
  if (artifact.content_json) {
    return artifact.content_json as T;
  }
  if (!artifact.path) {
    throw new Error(`input artifact missing content and path: ${type}`);
  }
  const resolved = path.isAbsolute(artifact.path)
    ? artifact.path
    : path.resolve(ctx.project_root, artifact.path);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw) as T;
}

function resolveBaseDecision(
  severity: Severity,
  triageMode: string,
  threshold?: Record<string, Decision>
): Decision {
  if (threshold && threshold[severity]) {
    return threshold[severity];
  }

  if (triageMode === "conservative") {
    if (severity === "high") {
      return "needs_review";
    }
    if (severity === "medium") {
      return "needs_review";
    }
    return "drop";
  }

  if (severity === "high") {
    return "keep";
  }
  if (severity === "medium") {
    return "needs_review";
  }
  if (severity === "low") {
    return "needs_review";
  }
  return "drop";
}

function adjustDecision(base: Decision, confidence: Confidence): Decision {
  if (base === "keep" && confidence === "low") {
    return "needs_review";
  }
  if (base === "needs_review" && confidence === "low") {
    return "drop";
  }
  if (base === "drop" && confidence === "high") {
    return "needs_review";
  }
  return base;
}

function resolveSeverity(severity: Severity, confidence: Confidence): Severity {
  if (severity === "high") {
    return confidence === "low" ? "medium" : "high";
  }
  if (severity === "medium") {
    return confidence === "high" ? "medium" : "low";
  }
  if (severity === "low") {
    return confidence === "high" ? "low" : "info";
  }
  return "info";
}

function buildRationale(severity: Severity, confidence: Confidence, decision: Decision): string {
  return `Decision ${decision} based on severity_hint ${severity} and confidence ${confidence}.`;
}

function summarize(triaged: TriagedFinding[]): FindingsTriagedArtifact["summary"] {
  let kept = 0;
  let dropped = 0;
  let needsReview = 0;
  for (const entry of triaged) {
    if (entry.decision === "keep") {
      kept += 1;
    } else if (entry.decision === "drop") {
      dropped += 1;
    } else {
      needsReview += 1;
    }
  }
  return { kept, dropped, needs_review: needsReview };
}

function sortBySeverityAndConfidence(
  candidates: FindingsCandidatesArtifact["candidates"]
): FindingsCandidatesArtifact["candidates"] {
  const severityRank: Record<Severity, number> = {
    high: 3,
    medium: 2,
    low: 1,
    info: 0
  };
  const confidenceRank: Record<Confidence, number> = {
    high: 2,
    medium: 1,
    low: 0
  };
  return [...candidates].sort((a, b) => {
    const severityDiff =
      severityRank[b.severity_hint] - severityRank[a.severity_hint];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return confidenceRank[b.confidence] - confidenceRank[a.confidence];
  });
}

function normalizeInt(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
