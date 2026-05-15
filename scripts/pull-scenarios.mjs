#!/usr/bin/env node
/**
 * Pulls every Make.com scenario that uses our Custom App into the local repo.
 *
 * Inverse of `deploy.mjs`: walks the remote team, filters scenarios whose
 * `usedPackages` references `app#${MAKE_APP_NAME}`, then writes each one to
 * `scenarios/<id>-<slug>.json` for local diffing / versioning.
 *
 * Volatile bookkeeping fields (executions, transfer, lastEdit, dlqCount, …)
 * are stripped so re-pulling produces a stable diff dominated by actual
 * blueprint edits.
 *
 * Required env (resolved from .env.local then .env, same loader as deploy.mjs):
 *   MAKE_APP_NAME   — suffixed app name, e.g. entity-enricher-3ebi2k
 *   MAKE_TEAM_ID    — Make team that hosts the dev scenarios
 *
 * Usage: pnpm run pull-scenarios
 */

import { spawnSync } from "node:child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(join(ROOT, ".env.local"));
loadEnv(join(ROOT, ".env"));

const APP_NAME = process.env.MAKE_APP_NAME;
const TEAM_ID = process.env.MAKE_TEAM_ID;

if (!APP_NAME || !TEAM_ID) {
  console.error("error: MAKE_APP_NAME and MAKE_TEAM_ID are required.");
  console.error("  Add to .env.local in this directory:");
  console.error("    MAKE_APP_NAME=entity-enricher-XXXXXX");
  console.error("    MAKE_TEAM_ID=1234567");
  console.error(
    "  Find your team id via: pnpm exec make-cli teams list --organization-id=<org-id>",
  );
  process.exit(1);
}

const APP_PACKAGE = `app#${APP_NAME}`;
const SCENARIOS_DIR = join(ROOT, "scenarios");

// Fields that change on every execution / edit and would otherwise dominate
// the diff. Stripped before write so re-pulling shows only real changes.
const VOLATILE_KEYS = new Set([
  "lastEdit",
  "executions",
  "operations",
  "centicredits",
  "transfer",
  "errors",
  "nextExec",
  "dlqCount",
  "allDlqCount",
  "iswaiting",
  "created",
  "createdByUser",
  "updatedByUser",
]);

// ---------------------------------------------------------------------------
// CLI helper (mirrors deploy.mjs)
// ---------------------------------------------------------------------------

function mk(args, { capture = true, allowFail = false } = {}) {
  console.log(`▸ make-cli ${args.join(" ")}`);
  const result = spawnSync("pnpm", ["exec", "make-cli", ...args], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  if (!capture) process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    if (allowFail) return null;
    console.error(`✗ exit ${result.status}`);
    process.exit(result.status || 1);
  }
  return result.stdout.trim();
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "scenario";
}

function stripVolatile(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (VOLATILE_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. List scenarios and filter to ones using our app
// ---------------------------------------------------------------------------

console.log(`Pulling scenarios using "${APP_PACKAGE}" from team ${TEAM_ID}\n`);

const listRaw = mk(["scenarios", "list", `--team-id=${TEAM_ID}`]);
const allScenarios = JSON.parse(listRaw);
const matching = allScenarios.filter((s) =>
  Array.isArray(s.usedPackages) && s.usedPackages.includes(APP_PACKAGE),
);

console.log(
  `Found ${matching.length} matching scenario(s) (of ${allScenarios.length} total)\n`,
);

if (matching.length === 0) {
  console.log("Nothing to pull.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Fetch each blueprint and write to disk
// ---------------------------------------------------------------------------

mkdirSync(SCENARIOS_DIR, { recursive: true });

for (const summary of matching) {
  const detailRaw = mk(["scenarios", "get", String(summary.id)]);
  const detail = JSON.parse(detailRaw);
  const cleaned = stripVolatile(detail);
  const filename = `${summary.id}-${slugify(summary.name)}.json`;
  const path = join(SCENARIOS_DIR, filename);
  writeFileSync(path, JSON.stringify(cleaned, null, 2) + "\n", "utf-8");
  console.log(`  · wrote scenarios/${filename}`);
}

console.log(`\n✓ Pulled ${matching.length} scenario(s) into scenarios/`);
