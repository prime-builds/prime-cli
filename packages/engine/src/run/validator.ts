import fs from "fs";
import path from "path";
import Ajv from "ajv/dist/2020";
import { ValidationError } from "../errors";
import type { WorkflowDefinition } from "./workflow";

const DEFAULT_SCHEMA_PATH = path.resolve(
  process.cwd(),
  "packages",
  "core",
  "src",
  "dsl",
  "schema.json"
);

const ajv = new Ajv({ allErrors: true });
const schema = JSON.parse(fs.readFileSync(DEFAULT_SCHEMA_PATH, "utf8"));
const validate = ajv.compile<WorkflowDefinition>(schema);

export function validateWorkflow(definition: WorkflowDefinition): void {
  const valid = validate(definition);
  if (!valid) {
    const message =
      validate.errors?.map((error) => `${error.instancePath} ${error.message}`).join("; ") ??
      "Workflow schema validation failed";
    throw new ValidationError(message.trim());
  }
}
