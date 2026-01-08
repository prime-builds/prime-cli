import path from "path";
import { FileSystemAdapterRegistry, type AdapterConflict } from "../registry";
import { Logger } from "../../logger";
import { runAdapterWithFixtures } from "./harness";

type Result = {
  id: string;
  ok: boolean;
  source: string;
  version: string;
  error?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = new Logger("info");
  const registry = new FileSystemAdapterRegistry({
    builtinsDir: path.resolve(process.cwd(), "packages", "engine", "src", "adapters", "builtin"),
    logger
  });
  const projectRoot = process.cwd();
  const adapters = registry.listAdapters(projectRoot);
  const targetId = args.id;
  const results: Result[] = [];

  for (const manifest of adapters) {
    if (targetId && manifest.id !== targetId) {
      continue;
    }
    const adapter = registry.getAdapter(manifest.id, projectRoot);
    const source = adapter?.source.kind ?? "unknown";
    const version = adapter?.manifest.version ?? "unknown";
    try {
      if (!adapter) {
        results.push({
          id: manifest.id,
          ok: false,
          source,
          version,
          error: "adapter not loadable"
        });
        continue;
      }
      await runAdapterWithFixtures(registry, manifest.id, projectRoot);
      results.push({
        id: manifest.id,
        ok: true,
        source,
        version
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      results.push({
        id: manifest.id,
        ok: false,
        source,
        version,
        error: message
      });
    }
  }

  printSummary(results);
  printConflicts(registry.getDiagnostics().conflicts);
  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

function parseArgs(argv: string[]): { id?: string } {
  const args: { id?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--id") {
      args.id = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function printSummary(results: Result[]): void {
  const header =
    "Adapter ID".padEnd(40) +
    "Status".padEnd(10) +
    "Source".padEnd(10) +
    "Version";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const result of results) {
    const status = result.ok ? "PASS" : "FAIL";
    console.log(
      result.id.padEnd(40) +
        status.padEnd(10) +
        result.source.padEnd(10) +
        result.version
    );
    if (result.error) {
      console.log(`  ${result.error}`);
    }
  }
}

function printConflicts(conflicts: AdapterConflict[]): void {
  if (conflicts.length === 0) {
    return;
  }
  console.log("");
  console.log("Adapter conflicts:");
  for (const conflict of conflicts) {
    const losers = conflict.losers.map(formatSource).join(", ");
    console.log(`- ${conflict.id}: winner=${formatSource(conflict.winner)} losers=${losers}`);
  }
}

function formatSource(source: AdapterConflict["winner"]): string {
  return `${source.kind}:${source.path}`;
}

void main();
