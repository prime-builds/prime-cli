import path from "path";
import { FileSystemAdapterRegistry } from "../registry";
import { Logger } from "../../logger";
import { runAdapterWithFixtures } from "./harness";

type Result = { id: string; ok: boolean; error?: string };

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
    try {
      await runAdapterWithFixtures(registry, manifest.id, projectRoot);
      results.push({ id: manifest.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      results.push({ id: manifest.id, ok: false, error: message });
    }
  }

  printSummary(results);
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
  const header = "Adapter ID".padEnd(40) + "Status";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const result of results) {
    const status = result.ok ? "PASS" : "FAIL";
    console.log(result.id.padEnd(40) + status);
    if (result.error) {
      console.log(`  ${result.error}`);
    }
  }
}

void main();
