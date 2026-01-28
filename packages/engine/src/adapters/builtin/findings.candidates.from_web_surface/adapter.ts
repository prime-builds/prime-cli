import fs from "fs";
import path from "path";
import type {
  AdapterExecution,
  AdapterExecutionContext,
  AdapterLogEntry
} from "../../../../../core/src/adapters";
import type {
  FindingsCandidatesArtifact,
  FindingCandidate,
  FindingEvidence,
  FindingRef,
  WebSurfaceArtifact
} from "../../../../../core/src/artifacts";

type EvidenceResponse = {
  url?: string;
  status?: number;
  headers?: Record<string, string>;
  body_sample?: string;
  path?: string;
};

const BASE_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy"
];

const ADMIN_PATHS = ["/admin", "/dashboard", "/manage"];

export const execute: AdapterExecution["execute"] = async (params, inputs, ctx) => {
  const target = String(params.target ?? "").trim();
  if (!target) {
    throw new Error("target is required");
  }
  if (ctx.mission?.scope_targets?.length) {
    if (!ctx.mission.scope_targets.includes(target)) {
      throw new Error("target must be one of scope.targets");
    }
  }

  const maxCandidates = normalizeInt(params.max_candidates, 50, 1);
  const includeKbRefs = params.include_kb_refs !== false;
  const ruleset = String(params.ruleset ?? "baseline");
  if (ruleset !== "baseline") {
    throw new Error("ruleset must be baseline");
  }
  const boostTerms = Array.isArray(params.kb_query_boost_terms)
    ? (params.kb_query_boost_terms as string[])
    : [];

  const webSurface = loadInput<WebSurfaceArtifact>(inputs, "web_surface.json", ctx);
  const evidenceResponses = loadEvidenceResponses(webSurface, ctx.project_root);
  const logs: AdapterLogEntry[] = [];
  const candidates: FindingCandidate[] = [];

  const missingHeaders = detectMissingHeaders(evidenceResponses);
  if (missingHeaders.length > 0) {
    candidates.push(
      buildCandidate("missing_security_headers", "Missing common security headers", {
        description: `Missing headers: ${missingHeaders.map((entry) => entry.header).join(", ")}.`,
        evidence: missingHeaders.map((entry) => ({
          kind: "header",
          value: `missing: ${entry.header}`,
          path: entry.path
        }))
      })
    );
  }

  const mixedContent = detectMixedContent(target, webSurface);
  if (mixedContent.length > 0) {
    candidates.push(
      buildCandidate("mixed_content_links", "Mixed content links detected", {
        description: "HTTP resources discovered on an HTTPS target.",
        evidence: mixedContent.slice(0, 5).map((url) => ({ kind: "url", value: url }))
      })
    );
  }

  const authSurface = detectAuthSurface(evidenceResponses, webSurface);
  if (authSurface.length > 0) {
    candidates.push(
      buildCandidate("authentication_surface_present", "Authentication surface present", {
        description: "Login or password-related forms detected.",
        evidence: authSurface.slice(0, 5)
      })
    );
  }

  const adminLinks = detectAdminEndpoints(webSurface);
  if (adminLinks.length > 0) {
    candidates.push(
      buildCandidate("sensitive_endpoint_discovered", "Sensitive endpoint discovered", {
        description: "Admin-like endpoints were discovered on the surface.",
        evidence: adminLinks.slice(0, 5).map((url) => ({ kind: "url", value: url }))
      })
    );
  }

  const dirListing = detectDirectoryListing(evidenceResponses);
  if (dirListing.length > 0) {
    candidates.push(
      buildCandidate("directory_listing_indicator", "Directory listing indicator", {
        description: "Response content indicates a possible directory listing.",
        evidence: dirListing.slice(0, 3)
      })
    );
  }

  const exposureHints = detectExposureHints(webSurface);
  if (exposureHints.length > 0) {
    candidates.push(
      buildCandidate("exposure_hints_detected", "Exposure hints detected", {
        description: "Robots or sitemap references were discovered.",
        evidence: exposureHints.slice(0, 3).map((url) => ({ kind: "url", value: url }))
      })
    );
  }

  const jsSurface = detectLargeJsSurface(webSurface);
  if (jsSurface.count >= 10) {
    candidates.push(
      buildCandidate("client_side_surface_large", "Client-side surface large", {
        description: `Discovered ${jsSurface.count} script assets.`,
        evidence: jsSurface.sample.map((url) => ({ kind: "url", value: url }))
      })
    );
  }

  const limited = candidates.slice(0, maxCandidates);
  const enriched = await attachKbRefs(limited, includeKbRefs, boostTerms, ctx);

  const artifact: FindingsCandidatesArtifact = {
    target,
    timestamp: new Date().toISOString(),
    source_artifacts: ["web_surface.json"],
    candidates: enriched.map((candidate, index) => ({
      ...candidate,
      id: formatCandidateId(index + 1)
    }))
  };

  logs.push({
    level: "info",
    message: "candidate generation complete",
    data: { candidates: artifact.candidates.length }
  });

  return {
    logs,
    artifacts: [
      {
        type: "findings_candidates.json",
        content_json: artifact
      }
    ]
  };
};

function loadInput<T>(inputs: Array<{ type: string; content_json?: unknown; path?: string }>, type: string, ctx: { project_root: string }): T {
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

function loadEvidenceResponses(
  webSurface: WebSurfaceArtifact,
  projectRoot: string
): EvidenceResponse[] {
  const responses: EvidenceResponse[] = [];
  for (const entry of webSurface.evidence ?? []) {
    if (entry.kind !== "http_response") {
      continue;
    }
    const resolved = path.isAbsolute(entry.path)
      ? entry.path
      : path.resolve(projectRoot, entry.path);
    if (!fs.existsSync(resolved)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(resolved, "utf8");
      const parsed = JSON.parse(raw) as EvidenceResponse;
      responses.push({ ...parsed, path: entry.path });
    } catch {
      continue;
    }
  }
  return responses;
}

function detectMissingHeaders(
  responses: EvidenceResponse[]
): Array<{ header: string; path?: string }> {
  if (responses.length === 0) {
    return [];
  }
  const headers = new Set<string>();
  const path = responses[0].path;
  for (const response of responses) {
    const entries = response.headers ?? {};
    for (const key of Object.keys(entries)) {
      headers.add(key.toLowerCase());
    }
  }
  return BASE_HEADERS.filter((header) => !headers.has(header)).map((header) => ({
    header,
    path
  }));
}

function detectMixedContent(target: string, webSurface: WebSurfaceArtifact): string[] {
  if (!target.startsWith("https://")) {
    return [];
  }
  const urls = new Set<string>();
  for (const entry of webSurface.urls ?? []) {
    if (entry.url.startsWith("http://")) {
      urls.add(entry.url);
    }
  }
  for (const entry of webSurface.links ?? []) {
    if (entry.url.startsWith("http://")) {
      urls.add(entry.url);
    }
  }
  return [...urls];
}

function detectAuthSurface(
  responses: EvidenceResponse[],
  webSurface: WebSurfaceArtifact
): FindingEvidence[] {
  const evidence: FindingEvidence[] = [];
  for (const form of webSurface.forms ?? []) {
    if (form.action) {
      evidence.push({ kind: "url", value: form.action });
    }
  }
  for (const response of responses) {
    const sample = response.body_sample ?? "";
    if (sample.includes("type=\"password\"") || sample.includes("type='password'")) {
      evidence.push({
        kind: "html",
        value: "password input detected",
        path: response.path
      });
      break;
    }
  }
  return evidence;
}

function detectAdminEndpoints(webSurface: WebSurfaceArtifact): string[] {
  const urls = new Set<string>();
  const all = [...(webSurface.urls ?? []), ...(webSurface.links ?? [])];
  for (const entry of all) {
    const url = entry.url.toLowerCase();
    if (ADMIN_PATHS.some((pathPart) => url.includes(pathPart))) {
      urls.add(entry.url);
    }
  }
  return [...urls];
}

function detectDirectoryListing(responses: EvidenceResponse[]): FindingEvidence[] {
  const evidence: FindingEvidence[] = [];
  for (const response of responses) {
    const sample = response.body_sample ?? "";
    if (sample.includes("Index of /") || sample.includes("Directory listing")) {
      evidence.push({
        kind: "html",
        value: "directory listing indicator",
        path: response.path
      });
    }
  }
  return evidence;
}

function detectExposureHints(webSurface: WebSurfaceArtifact): string[] {
  const urls = new Set<string>();
  const all = [...(webSurface.urls ?? []), ...(webSurface.links ?? [])];
  for (const entry of all) {
    const lower = entry.url.toLowerCase();
    if (lower.endsWith("/robots.txt") || lower.endsWith("/sitemap.xml")) {
      urls.add(entry.url);
    }
  }
  return [...urls];
}

function detectLargeJsSurface(
  webSurface: WebSurfaceArtifact
): { count: number; sample: string[] } {
  const scripts = webSurface.urls
    ? webSurface.urls.filter((entry) =>
        entry.url.toLowerCase().endsWith(".js") || entry.source === "script"
      )
    : [];
  const sample = scripts.slice(0, 5).map((entry) => entry.url);
  return { count: scripts.length, sample };
}

function buildCandidate(
  type: string,
  title: string,
  options: { description: string; evidence: FindingEvidence[] }
): FindingCandidate {
  return {
    id: "cand",
    type,
    title,
    description: options.description,
    evidence: options.evidence,
    confidence: "medium",
    severity_hint: severityHintForType(type),
    tags: tagsForType(type),
    refs: []
  };
}

function severityHintForType(type: string): FindingCandidate["severity_hint"] {
  switch (type) {
    case "missing_security_headers":
    case "mixed_content_links":
      return "medium";
    case "authentication_surface_present":
    case "sensitive_endpoint_discovered":
      return "low";
    case "directory_listing_indicator":
      return "high";
    case "exposure_hints_detected":
    case "client_side_surface_large":
    default:
      return "info";
  }
}

function tagsForType(type: string): string[] {
  switch (type) {
    case "missing_security_headers":
      return ["headers"];
    case "mixed_content_links":
      return ["mixed-content"];
    case "authentication_surface_present":
      return ["auth"];
    case "sensitive_endpoint_discovered":
      return ["sensitive"];
    case "directory_listing_indicator":
      return ["directory-listing"];
    case "exposure_hints_detected":
      return ["exposure"];
    case "client_side_surface_large":
      return ["javascript"];
    default:
      return [];
  }
}

async function attachKbRefs(
  candidates: FindingCandidate[],
  includeKbRefs: boolean,
  boostTerms: string[],
  ctx: AdapterExecutionContext
): Promise<FindingCandidate[]> {
  const docsSearch = ctx.docs_search;
  if (!includeKbRefs || !docsSearch) {
    return candidates;
  }

  const enriched: FindingCandidate[] = [];
  for (const candidate of candidates) {
    const query = buildKbQuery(candidate.type, boostTerms);
    let refs: FindingRef[] = [];
    try {
      const result = docsSearch({ query, top_k: 2 });
      refs = result.results.map((entry) => ({
        source: "kb",
        doc_id: entry.doc_id,
        chunk_id: entry.chunk_id,
        label: entry.file_name
      }));
    } catch {
      refs = [];
    }
    enriched.push({ ...candidate, refs });
  }
  return enriched;
}

function buildKbQuery(type: string, boostTerms: string[]): string {
  const typePhrase = type.replace(/_/g, " ");
  const terms = [typePhrase, `${typePhrase} explanation`, ...boostTerms].filter(
    (term) => term.length > 0
  );
  return terms.map((term) => `"${term.replace(/"/g, "\"\"")}"`).join(" OR ");
}

function formatCandidateId(index: number): string {
  return `cand_${String(index).padStart(3, "0")}`;
}

function normalizeInt(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.floor(parsed));
}
