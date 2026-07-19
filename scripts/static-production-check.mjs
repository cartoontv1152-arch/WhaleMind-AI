import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const checks = [
  {
    file: "components/landing",
    pattern: /href="#"/,
    message: "Landing pages must not ship placeholder href=\"#\" links.",
  },
  {
    file: "components",
    pattern: /href=\{[^}]*\?\?\s*["']#["']/,
    message: "News/source links must render non-clickable text when no source URL is available.",
  },
  {
    file: "components",
    pattern: /Private beta|Manual beta|Completed beta/,
    message: "Production UI must not expose stale beta wording.",
  },
  {
    file: "components/landing",
    pattern: /Premium AI analyst chat|Team risk approvals|Public launch analytics|Solo Desk|Vault Nine|Signal Works/,
    message: "Landing pages must not claim unimplemented features or fabricated customer proof.",
  },
  {
    file: "components/dashboard/dashboard-client.tsx",
    pattern: /symbol:\s*snapshot\.sodex\.symbol/,
    message: "Order intents must use the selected asset's SoDEX route, not the default snapshot route.",
  },
  {
    file: "lib/sodex.ts",
    pattern: /type:\s*"newOrder"/,
    message: "SoDEX payload hash must sign the exact order body submitted to the live endpoint.",
  },
  {
    file: "lib/sosovalue.ts",
    pattern: /createdAt:\s*item\.create_time/,
    message: "SoSoValue hot news timestamps must use the documented release_time field.",
  },
  {
    file: "lib/user-state.ts",
    pattern: /Date\.now\(\)\.toString\(36\)/,
    message: "Wallet-owned saved-state records must not use timestamp-only generated IDs.",
  },
];

function readTarget(target) {
  const fullPath = join(root, target);
  const stat = statSync(fullPath);
  if (stat.isFile()) return readFileSync(fullPath, "utf8");

  if (!target.endsWith(".ts") && !target.endsWith(".tsx")) {
    const files = readSourceFiles(fullPath);
    return files.map((path) => readFileSync(path, "utf8")).join("\n");
  }

  return readFileSync(fullPath, "utf8");
}

function readSourceFiles(directory) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) return readSourceFiles(path);
      return stat.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx")) ? [path] : [];
    });
}

const failures = [];

for (const check of checks) {
  const content = await readTarget(check.file);
  if (check.pattern.test(content)) failures.push(`${check.file}: ${check.message}`);
}

if (failures.length > 0) {
  console.error("Static production checks failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Static production checks passed.");
