import path from "path";
import { Logger } from "../../logger";
import { FileSystemAdapterRegistry } from "../registry";
import { runConformance } from "./runner";

type Result = { id: string; ok: boolean; errors: string[] };

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
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`  ${error}`);
      }
    }
  }
}

void main();
