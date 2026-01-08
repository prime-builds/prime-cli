import fs from "fs";
import path from "path";
import type { AdapterArtifact, AdapterExecution, AdapterManifest } from "../../../../core/src/adapters";
import {
  createAdapterRuntime,
  isStrictParamsSchema,
  validateManifest
} from "../../../../core/src/adapters";
import type { WorkflowStep } from "../../run/workflow";
import { Logger } from "../../logger";

export interface AdapterDefinition {
  manifest: AdapterManifest;
  execute: AdapterExecution["execute"];
  runtime: ReturnType<typeof createAdapterRuntime>;
  source: "builtin" | "local";
  location: string;
}

export interface AdapterRegistry {
  listAdapters(projectRoot?: string): AdapterManifest[];
  getAdapter(id: string, projectRoot?: string): AdapterDefinition | undefined;
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
  private readonly builtinCache = new Map<string, AdapterDefinition>();
  private readonly localCache = new Map<string, Map<string, AdapterDefinition>>();
  private readonly loadErrors = new Map<string, string>();

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

  getLoadErrors(): Record<string, string> {
    return Object.fromEntries(this.loadErrors.entries());
  }

  private loadAll(projectRoot?: string): AdapterDefinition[] {
    const builtins = this.loadBuiltins();
    const locals = projectRoot ? this.loadLocal(projectRoot) : [];
    return [...locals, ...builtins];
  }

  private loadBuiltins(): AdapterDefinition[] {
    if (this.builtinCache.size > 0) {
      return [...this.builtinCache.values()];
    }
    const adapters = this.loadAdaptersFromDir(this.builtinsDir, "builtin");
    for (const adapter of adapters) {
      this.builtinCache.set(adapter.manifest.id, adapter);
    }
    return adapters;
  }

  private loadLocal(projectRoot: string): AdapterDefinition[] {
    const normalized = path.resolve(projectRoot);
    const existing = this.localCache.get(normalized);
    if (existing) {
      return [...existing.values()];
    }
    const localDir = path.resolve(normalized, "local_adapters");
    const adapters = fs.existsSync(localDir)
      ? this.loadAdaptersFromDir(localDir, "local")
      : [];
    const cache = new Map<string, AdapterDefinition>();
    for (const adapter of adapters) {
      if (cache.has(adapter.manifest.id)) {
        this.logger.warn("Duplicate local adapter id", { id: adapter.manifest.id });
        continue;
      }
      cache.set(adapter.manifest.id, adapter);
    }
    this.localCache.set(normalized, cache);
    return adapters;
  }

  private loadAdaptersFromDir(rootDir: string, source: "builtin" | "local"): AdapterDefinition[] {
    const dirs = findAdapterDirs(rootDir);
    const adapters: AdapterDefinition[] = [];
    for (const dir of dirs) {
      const result = loadAdapterFromDir(dir, source, this.logger);
      if (result.adapter) {
        adapters.push(result.adapter);
      } else if (result.error) {
        this.loadErrors.set(dir, result.error);
      }
    }
    return adapters;
  }
}

export class EmptyAdapterRegistry implements AdapterRegistry {
  listAdapters(): AdapterManifest[] {
    return [];
  }

  getAdapter(): AdapterDefinition | undefined {
    return undefined;
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
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
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
  source: "builtin" | "local",
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
        source,
        location: dir
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.warn("Failed to load adapter", { dir, error: message });
    return { error: message };
  }
}
