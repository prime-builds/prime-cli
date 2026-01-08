import path from "path";
import { Logger } from "../../logger";
import { FileSystemAdapterRegistry, type AdapterConflict } from "../registry";
import { runConformance } from "./runner";

type Result = {
  id: string;
  ok: boolean;
  errors: string[];
  source: string;
  version: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = new Logger("info");
  const registry = new FileSystemAdapterRegistry({
    builtinsDir: path.resolve(process.cwd(), "packages", "engine", "src", "adapters", "builtin"),
    logger
  });
  const projectRoot = process.cwd();
  const results = await runConformance(
    registry,
    projectRoot,
    args.id ? [args.id] : undefined
  );
  const enriched = results.map((result) => {
    const adapter = registry.getAdapter(result.id, projectRoot);
    return {
      ...result,
      source: adapter?.source.kind ?? "unknown",
      version: adapter?.manifest.version ?? "unknown"
    };
  });
  printSummary(enriched);
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
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`  ${error}`);
      }
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
