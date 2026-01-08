import fs from "fs";
import path from "path";
import type {
  AdapterArtifact,
  AdapterExecution,
  AdapterManifest
} from "../../../../core/src/adapters";
import {
  createAdapterRuntime,
  isStrictParamsSchema,
  validateManifest
} from "../../../../core/src/adapters";
import type { WorkflowStep } from "../../run/workflow";
import { Logger } from "../../logger";

export type AdapterSource = {
  kind: "builtin" | "local";
  path: string;
};

export type AdapterConflict = {
  id: string;
  winner: AdapterSource;
  losers: AdapterSource[];
};

export type AdapterLoadError = {
  source: AdapterSource;
  error: string;
};

export type AdapterDiagnostics = {
  loadErrors: AdapterLoadError[];
  conflicts: AdapterConflict[];
};

export interface AdapterDefinition {
  manifest: AdapterManifest;
  execute: AdapterExecution["execute"];
  runtime: ReturnType<typeof createAdapterRuntime>;
  source: AdapterSource;
}

export interface AdapterRegistry {
  listAdapters(projectRoot?: string): AdapterManifest[];
  getAdapter(id: string, projectRoot?: string): AdapterDefinition | undefined;
  getDiagnostics(): AdapterDiagnostics;
  validateStep(
    step: WorkflowStep,
    availableArtifacts: AdapterArtifact[],
    projectRoot?: string
  ): { ok: boolean; errors: string[] };
  resolveAdapterVersion(
    id: string,
    versionRange?: string,
    projectRoot?: string
  ): AdapterManifest | undefined;
}

type AdapterLoadResult = {
  adapter?: AdapterDefinition;
  error?: string;
};

type RegistryOptions = {
  builtinsDir: string;
  logger?: Logger;
};

export class FileSystemAdapterRegistry implements AdapterRegistry {
  private readonly builtinsDir: string;
  private readonly logger: Logger;
  private builtinCache?: { adapters: AdapterDefinition[]; errors: AdapterLoadError[] };
  private readonly localCache = new Map<
    string,
    { adapters: AdapterDefinition[]; errors: AdapterLoadError[] }
  >();
  private lastDiagnostics: AdapterDiagnostics = { loadErrors: [], conflicts: [] };

  constructor(options: RegistryOptions) {
    this.builtinsDir = options.builtinsDir;
    this.logger = options.logger ?? new Logger("info");
  }

  listAdapters(projectRoot?: string): AdapterManifest[] {
    const adapters = this.loadAll(projectRoot);
    return adapters.map((entry) => entry.manifest);
  }

  getAdapter(id: string, projectRoot?: string): AdapterDefinition | undefined {
    const adapters = this.loadAll(projectRoot);
    return adapters.find((entry) => entry.manifest.id === id);
  }

  getDiagnostics(): AdapterDiagnostics {
    return this.lastDiagnostics;
  }

  validateStep(
    step: WorkflowStep,
    availableArtifacts: AdapterArtifact[],
    projectRoot?: string
  ): { ok: boolean; errors: string[] } {
    const adapter = this.getAdapter(step.adapter, projectRoot);
    if (!adapter) {
      return { ok: false, errors: [`adapter not found: ${step.adapter}`] };
    }
    const paramsResult = adapter.runtime.validateParams(
      (step.params ?? {}) as Record<string, unknown>
    );
    const inputResult = adapter.runtime.validateInputs(availableArtifacts);
    const errors = [...paramsResult.errors, ...inputResult.errors];
    return { ok: errors.length === 0, errors };
  }

  resolveAdapterVersion(
    id: string,
    _versionRange?: string,
    projectRoot?: string
  ): AdapterManifest | undefined {
    const adapter = this.getAdapter(id, projectRoot);
    return adapter?.manifest;
  }

  private loadAll(projectRoot?: string): AdapterDefinition[] {
    const builtins = this.loadBuiltins();
    const locals = projectRoot ? this.loadLocal(projectRoot) : { adapters: [], errors: [] };
    const allAdapters = [...locals.adapters, ...builtins.adapters];
    const resolved = resolveConflicts(allAdapters);
    const diagnostics: AdapterDiagnostics = {
      loadErrors: [...builtins.errors, ...locals.errors].sort((a, b) =>
        a.source.path.localeCompare(b.source.path)
      ),
      conflicts: resolved.conflicts
    };

    this.lastDiagnostics = diagnostics;
    logConflicts(this.logger, diagnostics.conflicts);

    return resolved.adapters;
  }

  private loadBuiltins(): { adapters: AdapterDefinition[]; errors: AdapterLoadError[] } {
    if (this.builtinCache) {
      return this.builtinCache;
    }
    const result = this.loadAdaptersFromDir(this.builtinsDir, { kind: "builtin" });
    this.builtinCache = result;
    return result;
  }

  private loadLocal(projectRoot: string): { adapters: AdapterDefinition[]; errors: AdapterLoadError[] } {
    const normalized = path.resolve(projectRoot);
    const existing = this.localCache.get(normalized);
    if (existing) {
      return existing;
    }
    const localDir = path.resolve(normalized, "local_adapters");
    const result = fs.existsSync(localDir)
      ? this.loadAdaptersFromDir(localDir, { kind: "local" })
      : { adapters: [], errors: [] };
    this.localCache.set(normalized, result);
    return result;
  }

  private loadAdaptersFromDir(
    rootDir: string,
    source: Pick<AdapterSource, "kind">
  ): { adapters: AdapterDefinition[]; errors: AdapterLoadError[] } {
    const dirs = findAdapterDirs(rootDir);
    const adapters: AdapterDefinition[] = [];
    const errors: AdapterLoadError[] = [];
    for (const dir of dirs) {
      const result = loadAdapterFromDir(dir, { kind: source.kind, path: dir }, this.logger);
      if (result.adapter) {
        adapters.push(result.adapter);
      } else if (result.error) {
        errors.push({ source: { kind: source.kind, path: dir }, error: result.error });
      }
    }
    return { adapters, errors };
  }
}

export class EmptyAdapterRegistry implements AdapterRegistry {
  listAdapters(): AdapterManifest[] {
    return [];
  }

  getAdapter(): AdapterDefinition | undefined {
    return undefined;
  }

  getDiagnostics(): AdapterDiagnostics {
    return { loadErrors: [], conflicts: [] };
  }

  validateStep(): { ok: boolean; errors: string[] } {
    return { ok: false, errors: ["no adapters registered"] };
  }

  resolveAdapterVersion(): AdapterManifest | undefined {
    return undefined;
  }
}

export class StaticAdapterRegistry implements AdapterRegistry {
  private readonly adapters: AdapterDefinition[];

  constructor(adapters: AdapterDefinition[]) {
    this.adapters = adapters;
  }

  listAdapters(): AdapterManifest[] {
    return this.adapters.map((adapter) => adapter.manifest);
  }

  getAdapter(id: string): AdapterDefinition | undefined {
    return this.adapters.find((adapter) => adapter.manifest.id === id);
  }

  getDiagnostics(): AdapterDiagnostics {
    return { loadErrors: [], conflicts: [] };
  }

  validateStep(step: WorkflowStep, availableArtifacts: AdapterArtifact[]): { ok: boolean; errors: string[] } {
    const adapter = this.getAdapter(step.adapter);
    if (!adapter) {
      return { ok: false, errors: [`adapter not found: ${step.adapter}`] };
    }
    const paramsResult = adapter.runtime.validateParams(
      (step.params ?? {}) as Record<string, unknown>
    );
    const inputResult = adapter.runtime.validateInputs(availableArtifacts);
    const errors = [...paramsResult.errors, ...inputResult.errors];
    return { ok: errors.length === 0, errors };
  }

  resolveAdapterVersion(id: string): AdapterManifest | undefined {
    return this.getAdapter(id)?.manifest;
  }
}

function findAdapterDirs(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const dirs: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (hasAdapterFiles(fullPath)) {
        dirs.push(fullPath);
      }
      dirs.push(...findAdapterDirs(fullPath));
    }
  }
  return dirs;
}

function hasAdapterFiles(dir: string): boolean {
  const manifest = findFile(dir, "manifest");
  const adapter = findFile(dir, "adapter");
  return Boolean(manifest && adapter);
}

function findFile(dir: string, base: string): string | null {
  const candidates = [
    path.join(dir, `${base}.ts`),
    path.join(dir, `${base}.js`)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadAdapterFromDir(
  dir: string,
  source: AdapterSource,
  logger: Logger
): AdapterLoadResult {
  try {
    const manifestPath = findFile(dir, "manifest");
    const adapterPath = findFile(dir, "adapter");
    if (!manifestPath || !adapterPath) {
      return { error: "missing manifest.ts or adapter.ts" };
    }

    const manifestModule = require(manifestPath);
    const adapterModule = require(adapterPath);

    const manifest: AdapterManifest =
      manifestModule.manifest ?? manifestModule.default ?? manifestModule;
    const execute: AdapterExecution["execute"] =
      adapterModule.execute ?? adapterModule.default;

    if (!manifest || !execute) {
      return { error: "adapter module must export manifest and execute" };
    }

    const manifestCheck = validateManifest(manifest);
    if (!manifestCheck.ok) {
      return { error: `manifest invalid: ${manifestCheck.errors.join("; ")}` };
    }

    const strictCheck = isStrictParamsSchema(manifest.params_schema);
    if (!strictCheck.ok) {
      return { error: `params schema invalid: ${strictCheck.errors.join("; ")}` };
    }

    const runtime = createAdapterRuntime(manifest);
    return {
      adapter: {
        manifest,
        execute,
        runtime,
        source
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.warn("Failed to load adapter", { dir, error: message });
    return { error: message };
  }
}

function resolveConflicts(adapters: AdapterDefinition[]): {
  adapters: AdapterDefinition[];
  conflicts: AdapterConflict[];
} {
  const sorted = [...adapters].sort(compareAdapterPriority);
  const winners = new Map<string, AdapterDefinition>();
  const conflicts = new Map<
    string,
    { winner: AdapterDefinition; losers: AdapterDefinition[] }
  >();

  for (const adapter of sorted) {
    const id = adapter.manifest.id;
    const existing = winners.get(id);
    if (!existing) {
      winners.set(id, adapter);
      continue;
    }
    const conflict = conflicts.get(id) ?? { winner: existing, losers: [] };
    conflict.losers.push(adapter);
    conflicts.set(id, conflict);
  }

  const conflictEntries = Array.from(conflicts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, conflict]) => ({
      id,
      winner: conflict.winner.source,
      losers: conflict.losers.map((loser) => loser.source)
    }));

  const unique = Array.from(winners.values()).sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id)
  );

  return { adapters: unique, conflicts: conflictEntries };
}

function compareAdapterPriority(a: AdapterDefinition, b: AdapterDefinition): number {
  if (a.source.kind !== b.source.kind) {
    return a.source.kind === "local" ? -1 : 1;
  }
  return a.source.path.localeCompare(b.source.path);
}

function logConflicts(logger: Logger, conflicts: AdapterConflict[]): void {
  for (const conflict of conflicts) {
    const winner = formatSource(conflict.winner);
    const losers = conflict.losers.map(formatSource).join(",");
    logger.warn(`Adapter conflict id=${conflict.id} winner=${winner} losers=${losers}`);
  }
}

function formatSource(source: AdapterSource): string {
  return `${source.kind}:${source.path}`;
}
