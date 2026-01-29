import fs from "fs";
import path from "path";
import type { AdapterExecution, AdapterLogEntry } from "../../../../../core/src/adapters";
import type {
  FindingsCandidatesArtifact,
  FindingsTriagedArtifact,
  FindingRef
} from "../../../../../core/src/artifacts";

export const execute: AdapterExecution["execute"] = async (params, inputs, ctx) => {
  const includeCandidates = params.include_candidates !== false;
  const includeTriaged = params.include_triaged !== false;
  const boostTerms = Array.isArray(params.query_boost_terms)
    ? (params.query_boost_terms as string[])
    : [];

  const logs: AdapterLogEntry[] = [];
  const artifacts: Array<{ type: string; content_json: unknown }> = [];

  if (includeCandidates) {
    const candidates = loadInput<FindingsCandidatesArtifact>(
      inputs,
      "findings_candidates.json",
      ctx
    );
    const enriched = await enrichCandidates(candidates, boostTerms, ctx);
    artifacts.push({ type: "findings_candidates.json", content_json: enriched });
  }

  if (includeTriaged) {
    const triaged = loadInput<FindingsTriagedArtifact>(
      inputs,
      "findings_triaged.json",
      ctx
    );
    const enriched = await enrichTriaged(triaged, boostTerms, ctx);
    artifacts.push({ type: "findings_triaged.json", content_json: enriched });
  }

  logs.push({ level: "info", message: "kb ref enrichment complete" });

  return { logs, artifacts };
};

async function enrichCandidates(
  artifact: FindingsCandidatesArtifact,
  boostTerms: string[],
  ctx: { docs_search?: (input: { query: string; top_k?: number }) => { results: Array<{ doc_id: string; chunk_id: string; file_name: string }> } }
): Promise<FindingsCandidatesArtifact> {
  if (!ctx.docs_search) {
    return artifact;
  }
  const candidates = [];
  for (const candidate of artifact.candidates) {
    const refs = await lookupRefs(candidate.type, boostTerms, ctx);
    candidates.push({ ...candidate, refs: mergeRefs(candidate.refs, refs) });
  }
  return { ...artifact, candidates };
}

async function enrichTriaged(
  artifact: FindingsTriagedArtifact,
  boostTerms: string[],
  ctx: { docs_search?: (input: { query: string; top_k?: number }) => { results: Array<{ doc_id: string; chunk_id: string; file_name: string }> } }
): Promise<FindingsTriagedArtifact> {
  if (!ctx.docs_search) {
    return artifact;
  }
  const triaged = [];
  for (const entry of artifact.triaged) {
    const refs = await lookupRefs(entry.candidate_id, boostTerms, ctx);
    triaged.push({ ...entry, refs: mergeRefs(entry.refs, refs) });
  }
  return { ...artifact, triaged };
}

async function lookupRefs(
  key: string,
  boostTerms: string[],
  ctx: { docs_search?: (input: { query: string; top_k?: number }) => { results: Array<{ doc_id: string; chunk_id: string; file_name: string }> } }
): Promise<FindingRef[]> {
  if (!ctx.docs_search) {
    return [];
  }
  const query = buildQuery(key, boostTerms);
  try {
    const result = ctx.docs_search({ query, top_k: 2 });
    return result.results.map((entry) => ({
      source: "kb",
      doc_id: entry.doc_id,
      chunk_id: entry.chunk_id,
      label: entry.file_name
    }));
  } catch {
    return [];
  }
}

function buildQuery(key: string, boostTerms: string[]): string {
  const base = key.replace(/_/g, " ");
  const terms = [base, ...boostTerms].filter(Boolean);
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ");
}

function mergeRefs(existing: FindingRef[], incoming: FindingRef[]): FindingRef[] {
  const seen = new Set(existing.map((ref) => `${ref.doc_id}:${ref.chunk_id}`));
  const merged = [...existing];
  for (const ref of incoming) {
    const key = `${ref.doc_id}:${ref.chunk_id}`;
    if (!seen.has(key)) {
      merged.push(ref);
      seen.add(key);
    }
  }
  return merged;
}

function loadInput<T>(
  inputs: Array<{ type: string; content_json?: unknown; path?: string }>,
  type: string,
  ctx: { project_root: string }
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
