import type { MissionManifest } from "../../../shared/src/contracts";
import type { AdapterRegistry } from "../adapters/registry";
import { buildAdapterSummaries, type AdapterSummary } from "../adapters/summary";
import type { DocsService } from "../docs";
import type { StorageRepos } from "../storage";
import type { PlannerContext, PlannerSnippet } from "./types";

export function buildPlannerContext(input: {
  project_id: string;
  chat_id?: string;
  message: { role: "user" | "assistant" | "system"; content: string };
  mission: MissionManifest;
  project_root?: string;
  repos: StorageRepos;
  docs: DocsService;
  registry: AdapterRegistry;
}): PlannerContext {
  const adapter_capabilities = buildAdapterSummaries(
    input.registry.listAdapters(input.project_root)
  );
  const retrieved_snippets = retrieveSnippets({
    project_id: input.project_id,
    message: input.message,
    mission: input.mission,
    adapters: adapter_capabilities,
    docs: input.docs
  });
  const artifacts = loadArtifacts(input.repos, input.chat_id, input.project_id);

  return {
    project_id: input.project_id,
    chat_id: input.chat_id,
    message: input.message,
    mission_manifest: input.mission,
    adapter_capabilities,
    artifacts,
    retrieved_snippets
  };
}

function loadArtifacts(repos: StorageRepos, chatId?: string, projectId?: string) {
  const records = repos.artifacts.list({
    chat_id: chatId,
    project_id: projectId
  });
  return records.map((artifact) => ({
    id: artifact.id,
    name: artifact.name,
    path: artifact.path,
    media_type: artifact.media_type ?? undefined,
    run_id: artifact.run_id ?? undefined,
    step_id: artifact.step_id ?? undefined,
    chat_id: artifact.chat_id ?? undefined
  }));
}

function retrieveSnippets(input: {
  project_id: string;
  message: { role: "user" | "assistant" | "system"; content: string };
  mission: MissionManifest;
  adapters: AdapterSummary[];
  docs: DocsService;
}): PlannerSnippet[] {
  const searchTerms = buildSearchTerms(input.message, input.mission, input.adapters);
  if (searchTerms.length === 0) {
    return [];
  }

  const toolNames = collectToolNames(input.project_id, input.docs);
  const query = buildSearchQuery([...searchTerms, ...toolNames]);
  if (!query) {
    return [];
  }

  try {
    const results = input.docs.searchDocs({
      project_id: input.project_id,
      query,
      top_k: 6
    }).results;
    return results.map((result) => ({
      doc_id: result.doc_id,
      chunk_id: result.chunk_id,
      snippet: result.snippet,
      file_name: result.file_name,
      tool_name: result.tool_name,
      category: result.category
    }));
  } catch {
    return [];
  }
}

function collectToolNames(projectId: string, docs: DocsService): string[] {
  try {
    const records = docs.listDocs({ project_id: projectId }).docs;
    const names = new Set<string>();
    for (const doc of records) {
      if (doc.tool_name) {
        names.add(doc.tool_name);
      }
      if (doc.category) {
        names.add(doc.category);
      }
    }
    return [...names];
  } catch {
    return [];
  }
}

function buildSearchTerms(
  message: { content: string },
  mission: MissionManifest,
  adapters: AdapterSummary[]
): string[] {
  const terms = new Set<string>();
  addTokens(terms, message.content, 24);
  addTokens(terms, mission.objective, 24);
  for (const adapter of adapters) {
    if (adapter.name) {
      addTokens(terms, adapter.name, 6);
    }
    if (adapter.category) {
      addTokens(terms, adapter.category, 4);
    }
  }
  return [...terms];
}

function buildSearchQuery(terms: string[]): string {
  const sanitized = terms
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  if (sanitized.length === 0) {
    return "";
  }
  return sanitized.map((term) => `"${escapePhrase(term)}"`).join(" OR ");
}

function escapePhrase(value: string): string {
  return value.replace(/"/g, '""');
}

function addTokens(target: Set<string>, value: string, maxTokens: number): void {
  if (!value) {
    return;
  }
  const matches = value.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g);
  if (!matches) {
    return;
  }
  let added = 0;
  for (const token of matches) {
    if (added >= maxTokens) {
      break;
    }
    if (!target.has(token)) {
      target.add(token);
      added += 1;
    }
  }
}
