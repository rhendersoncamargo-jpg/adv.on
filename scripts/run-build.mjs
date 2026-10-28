import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
const cli = isVercel
  ? new URL("../node_modules/next/dist/bin/next", import.meta.url)
  : new URL("./run-framework.mjs", import.meta.url);
const args = isVercel ? [fileURLToPath(cli), "build"] : [fileURLToPath(cli), "build"];
const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });

process.exit(result.status ?? 1);
