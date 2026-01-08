import fs from "fs";
import path from "path";
import type { AdapterExecution } from "../../../../../core/src/adapters";

export const execute: AdapterExecution["execute"] = async (params, _inputs, ctx) => {
  const relativePath = String(params.path ?? "");
  const filePath = path.resolve(ctx.project_root, relativePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as unknown;

  return {
    logs: [
      { level: "info", message: "read json file", data: { path: relativePath } }
    ],
    artifacts: [
      {
        type: "extracted_data.json",
        content_json: { data }
      }
    ]
  };
};
