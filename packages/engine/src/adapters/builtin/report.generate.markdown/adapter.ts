import fs from "fs";
import path from "path";
import type {
  AdapterExecution,
  AdapterExecutionContext,
  AdapterLogEntry
} from "../../../../../core/src/adapters";
import type {
  FindingsCandidatesArtifact,
  FindingsTriagedArtifact,
  ReportArtifact,
  WebSurfaceArtifact
} from "../../../../../core/src/artifacts";

export const execute: AdapterExecution["execute"] = async (params, inputs, ctx) => {
  const includeEvidence = params.include_evidence_links !== false;
  const includeCitations = params.include_kb_citations !== false;

  const webSurface = loadInput<WebSurfaceArtifact>(inputs, "web_surface.json", ctx);
  const triaged = loadInput<FindingsTriagedArtifact>(
    inputs,
    "findings_triaged.json",
    ctx
  );
  const candidates = loadOptionalInput<FindingsCandidatesArtifact>(
    inputs,
    "findings_candidates.json",
    ctx
  );
  const candidatesById = new Map(
    (candidates?.candidates ?? []).map((entry) => [entry.id, entry])
  );

  const reportDir = path.resolve(ctx.project_root, "reports", ctx.run_id ?? "run");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "report.md");

  const content = buildReport({
    webSurface,
    triaged,
    candidatesById,
    missionObjective: ctx.mission?.objective,
    includeEvidence,
    includeCitations,
    runId: ctx.run_id
  });

  fs.writeFileSync(reportPath, content, "utf8");

  const reportArtifact: ReportArtifact = {
    target: triaged.target ?? webSurface.target,
    timestamp: new Date().toISOString(),
    artifacts: ["web_surface.json", "findings_triaged.json"],
    report_path: toRelativePath(ctx.project_root, reportPath)
  };

  const logs: AdapterLogEntry[] = [
    { level: "info", message: "report generated", data: { path: reportArtifact.report_path } }
  ];

  return {
    logs,
    artifacts: [
      {
        type: "report.json",
        path: reportPath,
        content_json: reportArtifact
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

function loadOptionalInput<T>(
  inputs: Array<{ type: string; content_json?: unknown; path?: string }>,
  type: string,
  ctx: AdapterExecutionContext
): T | null {
  const artifact = inputs.find((entry) => entry.type === type);
  if (!artifact) {
    return null;
  }
  if (artifact.content_json) {
    return artifact.content_json as T;
  }
  if (!artifact.path) {
    return null;
  }
  const resolved = path.isAbsolute(artifact.path)
    ? artifact.path
    : path.resolve(ctx.project_root, artifact.path);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw) as T;
}

function buildReport(input: {
  webSurface: WebSurfaceArtifact;
  triaged: FindingsTriagedArtifact;
  candidatesById: Map<string, FindingsCandidatesArtifact["candidates"][number]>;
  missionObjective?: string;
  includeEvidence: boolean;
  includeCitations: boolean;
  runId?: string;
}): string {
  const lines: string[] = [];
  const target = input.triaged.target ?? input.webSurface.target;
  const timestamp = input.triaged.timestamp ?? new Date().toISOString();

  lines.push(`# Assessment Report`);
  lines.push("");
  lines.push(`Target: ${target}`);
  lines.push(`Timestamp: ${timestamp}`);
  lines.push("");
  lines.push(`Mission Objective: ${input.missionObjective ?? "Not provided"}`);
  lines.push("");

  lines.push("## Summary");
  lines.push(
    `- Kept: ${input.triaged.summary.kept}, Needs Review: ${input.triaged.summary.needs_review}, Dropped: ${input.triaged.summary.dropped}`
  );
  const severityCounts = countBySeverity(input.triaged.triaged);
  lines.push(
    `- Severity: high ${severityCounts.high}, medium ${severityCounts.medium}, low ${severityCounts.low}, info ${severityCounts.info}`
  );
  lines.push("");

  lines.push("## Key Findings");
  const findings = input.triaged.triaged.filter(
    (entry) => entry.decision === "keep" || entry.decision === "needs_review"
  );
  if (findings.length === 0) {
    lines.push("- No findings retained.");
  } else {
    for (const entry of findings) {
      const candidate = input.candidatesById.get(entry.candidate_id);
      const title = candidate?.title ?? entry.candidate_id;
      const description = candidate?.description ?? entry.rationale;
      lines.push(`- **${title}** (${entry.decision}, severity: ${entry.severity})`);
      lines.push(`  - ${description}`);
      if (input.includeEvidence && candidate?.evidence?.length) {
        lines.push(`  - Evidence:`);
        for (const ev of candidate.evidence) {
          if (ev.path) {
            lines.push(`    - ${ev.kind}: ${ev.value} (${ev.path})`);
          } else {
            lines.push(`    - ${ev.kind}: ${ev.value}`);
          }
        }
      }
      if (input.includeCitations && entry.refs.length > 0) {
        lines.push(`  - KB refs:`);
        for (const ref of entry.refs) {
          lines.push(`    - ${ref.label ?? "doc"} (${ref.doc_id}#${ref.chunk_id})`);
        }
      }
    }
  }
  lines.push("");

  lines.push("## Appendix");
  lines.push(`- Artifacts: ${input.triaged.source_artifacts.join(", ")}`);
  if (input.runId) {
    lines.push(`- Run ID: ${input.runId}`);
  }
  lines.push("");

  return lines.join("\n");
}

function countBySeverity(
  triaged: FindingsTriagedArtifact["triaged"]
): Record<"high" | "medium" | "low" | "info", number> {
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  for (const entry of triaged) {
    counts[entry.severity] += 1;
  }
  return counts;
}

function toRelativePath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath);
  if (!relative || relative.startsWith("..")) {
    return filePath;
  }
  return relative.split(path.sep).join("/");
}
