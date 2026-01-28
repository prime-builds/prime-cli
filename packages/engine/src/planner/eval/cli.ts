import fs from "fs";
import path from "path";
import { LocalPlannerProvider } from "../providers/local";
import { validateWorkflow } from "../../run/validator";
import type { PlannerContext } from "../types";

const fixturesDir = path.resolve(
  process.cwd(),
  "packages",
  "engine",
  "src",
  "planner",
  "eval",
  "fixtures"
);

const provider = new LocalPlannerProvider();
provider.configure({ prompt_version: "planner-v1" });

const files = fs.readdirSync(fixturesDir).filter((file) => file.endsWith(".json"));
if (files.length === 0) {
  console.error("No planner eval fixtures found.");
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const raw = fs.readFileSync(path.join(fixturesDir, file), "utf8");
  const context = JSON.parse(raw) as PlannerContext;
  try {
    const result = provider.plan(context);
    const workflow = JSON.parse(result.workflow_json);
    validateWorkflow(workflow);
    console.log(`${file}: PASS`);
  } catch (error) {
    failures += 1;
    console.error(`${file}: FAIL - ${(error as Error).message}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
