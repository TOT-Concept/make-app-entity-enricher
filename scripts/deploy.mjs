#!/usr/bin/env node
/**
 * Deploys the local Make.com Custom App source to a remote SDK app.
 *
 * Walks the local directory and pushes every section / module / RPC to the
 * remote app named in `.env.local` (`MAKE_APP_NAME`). Idempotent — runs `list`
 * first and only `create`s entities that don't already exist on the remote;
 * everything else is `set-section`. Stops on first error so failures can be
 * fixed and re-run incrementally.
 *
 * The `MAKE_APP_NAME` is the Make-assigned (suffixed) name returned by
 * `make-cli sdk-apps create` — e.g. `entity-enricher-3ebi2k`. Pinning it in
 * `.env.local` (gitignored, per-developer) keeps each developer's local files
 * portable across team members. When CI deployment lands later, the name will
 * move to a committed config so the GitHub Actions workflow uses a shared
 * dev app.
 *
 * Usage: pnpm run deploy
 */

import { spawnSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Minimal .env parser to avoid adding dotenv as a dep.
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
const APP_VERSION = process.env.MAKE_APP_VERSION || "1";

if (!APP_NAME) {
  console.error("error: MAKE_APP_NAME is required.");
  console.error("  Create .env.local in this directory containing:");
  console.error("    MAKE_APP_NAME=entity-enricher-XXXXXX");
  console.error(
    "  (the suffixed name printed by `pnpm exec make-cli sdk-apps create`)",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function mk(args, { capture = false, allowFail = false } = {}) {
  console.log(`▸ make-cli ${args.join(" ")}`);
  const result = spawnSync("pnpm", ["exec", "make-cli", ...args], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    if (allowFail) return null;
    console.error(`✗ exit ${result.status}`);
    process.exit(result.status || 1);
  }
  return capture ? result.stdout.trim() : null;
}

function readBody(path) {
  return readFileSync(path, "utf-8");
}

function readMetadata(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function listSubdirs(parent) {
  if (!existsSync(parent)) return [];
  return readdirSync(parent).filter((d) =>
    statSync(join(parent, d)).isDirectory(),
  );
}

console.log(`Deploying to app "${APP_NAME}" version ${APP_VERSION}\n`);

// ---------------------------------------------------------------------------
// 1. App-level sections
// ---------------------------------------------------------------------------

console.log("─── App sections ───");

mk([
  "sdk-apps",
  "set-section",
  `--name=${APP_NAME}`,
  `--version=${APP_VERSION}`,
  "--section=base",
  `--body=${readBody(join(ROOT, "base.imljson"))}`,
]);

if (existsSync(join(ROOT, "common.imljson"))) {
  mk([
    "sdk-apps",
    "set-common",
    `--name=${APP_NAME}`,
    `--version=${APP_VERSION}`,
    `--common=${readBody(join(ROOT, "common.imljson"))}`,
  ]);
}

// help.md — user-facing help shown in the Developer Hub's "Help center"
// tab and on the public marketplace listing. Pushed via the dedicated
// `set-docs` subcommand (the CLI doesn't expose `readme` as a
// `set-section` choice). README.md stays GitHub/dev-facing and is not
// uploaded to Make.
if (existsSync(join(ROOT, "help.md"))) {
  mk([
    "sdk-apps",
    "set-docs",
    `--name=${APP_NAME}`,
    `--version=${APP_VERSION}`,
    `--docs=${readBody(join(ROOT, "help.md"))}`,
  ]);
}

// ---------------------------------------------------------------------------
// 2. Connections
// ---------------------------------------------------------------------------

console.log("\n─── Connections ───");

// Accepted values of the `type` body field on
// POST /sdk/apps/{name}/connections. Make validates server-side and answers a
// bare `Value not found in options in parameter 'type'` 400 — and `make-cli
// sdk-connections create --help` advertises `oauth2`, which is NOT in the enum
// (OAuth 2.0 with a `refresh` directive is `oauth-refresh`, without one
// `oauth`). Checked here so a typo in metadata.json fails before the call,
// with the valid list. Make reports `oauth-refresh` back as `oauth` in
// `sdk-connections list` — that's normalization, not a rejected type; re-runs
// match on label anyway, so the connection is never re-created.
const CONNECTION_TYPES = [
  "oauth",
  "oauth-refresh",
  "oauth-resowncre",
  "oauth-clicre",
  "oauth-1",
  "apikey",
  "basic",
  "other",
];

const existingConnsRaw = mk(
  ["sdk-connections", "list", `--app-name=${APP_NAME}`],
  { capture: true },
);
const existingConns = existingConnsRaw ? JSON.parse(existingConnsRaw) : [];

// Local connection name (from metadata.json) → Make-assigned name.
// Populated by the connections loop and read by the modules loop to wire
// each module to its declared connection.
const connectionNameMap = {};

for (const localName of listSubdirs(join(ROOT, "connections"))) {
  const dir = join(ROOT, "connections", localName);
  const meta = readMetadata(join(dir, "metadata.json"));

  // Match by label since Make auto-assigns the connection's actual name.
  const existing = existingConns.find((c) => c.label === meta.label);
  let makeName;
  if (existing) {
    makeName = existing.name;
    console.log(`  · "${localName}" exists as ${makeName}`);
  } else {
    if (!CONNECTION_TYPES.includes(meta.type)) {
      console.error(
        `  ✗ connection "${localName}" declares type="${meta.type}", which ` +
          `Make does not accept.\n    Valid types: ${CONNECTION_TYPES.join(", ")}`,
      );
      process.exit(1);
    }
    const created = mk(
      [
        "sdk-connections",
        "create",
        `--app-name=${APP_NAME}`,
        `--type=${meta.type}`,
        `--label=${meta.label}`,
      ],
      { capture: true },
    );
    makeName = JSON.parse(created).name;
    console.log(`  · "${localName}" created as ${makeName}`);
  }
  connectionNameMap[localName] = makeName;

  // File → section mapping for connections.
  // (`communication.imljson` historically named for the connection-test
  // request; Make's CLI calls this section `api`.)
  const sections = [
    ["parameters.imljson", "parameters"],
    ["communication.imljson", "api"],
  ];
  for (const [file, section] of sections) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    mk([
      "sdk-connections",
      "set-section",
      `--connection-name=${makeName}`,
      `--section=${section}`,
      `--body=${readBody(path)}`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// 3. Modules
// ---------------------------------------------------------------------------

console.log("\n─── Modules ───");

const existingModsRaw = mk(
  [
    "sdk-modules",
    "list",
    `--app-name=${APP_NAME}`,
    `--app-version=${APP_VERSION}`,
  ],
  { capture: true },
);
const existingMods = existingModsRaw ? JSON.parse(existingModsRaw) : [];
const moduleNames = new Set(existingMods.map((m) => m.name));

for (const dirName of listSubdirs(join(ROOT, "modules"))) {
  const dir = join(ROOT, "modules", dirName);
  const meta = readMetadata(join(dir, "metadata.json"));

  if (!moduleNames.has(meta.name)) {
    mk([
      "sdk-modules",
      "create",
      `--app-name=${APP_NAME}`,
      `--app-version=${APP_VERSION}`,
      `--name=${meta.name}`,
      `--type-id=${meta.typeId}`,
      `--label=${meta.label}`,
      `--description=${meta.description || ""}`,
    ]);
    console.log(`  · created module "${meta.name}"`);
  } else {
    console.log(`  · "${meta.name}" exists`);
  }

  // Wire module → connection. The connection name in local metadata.json
  // (e.g. "apiKey") is translated to Make's auto-assigned name via
  // connectionNameMap built earlier. `sdk-modules create` doesn't accept a
  // --connection flag; only `update` does, so we run update after create.
  if (meta.connection) {
    const makeConnName = connectionNameMap[meta.connection];
    if (!makeConnName) {
      console.error(
        `  ✗ module "${meta.name}" declares connection="${meta.connection}" ` +
          `but no local connection with that name was deployed`,
      );
      process.exit(1);
    }
    mk([
      "sdk-modules",
      "update",
      `--app-name=${APP_NAME}`,
      `--app-version=${APP_VERSION}`,
      `--module-name=${meta.name}`,
      `--connection=${makeConnName}`,
    ]);
  }

  for (const [file, section] of [
    ["api.imljson", "api"],
    ["parameters.imljson", "parameters"],
    ["expect.imljson", "expect"],
    ["interface.imljson", "interface"],
    ["samples.imljson", "samples"],
  ]) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    mk([
      "sdk-modules",
      "set-section",
      `--app-name=${APP_NAME}`,
      `--app-version=${APP_VERSION}`,
      `--module-name=${meta.name}`,
      `--section=${section}`,
      `--body=${readBody(path)}`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// 4. RPCs
// ---------------------------------------------------------------------------

console.log("\n─── RPCs ───");

const existingRpcsRaw = mk(
  [
    "sdk-rpcs",
    "list",
    `--app-name=${APP_NAME}`,
    `--app-version=${APP_VERSION}`,
  ],
  { capture: true },
);
const existingRpcs = existingRpcsRaw ? JSON.parse(existingRpcsRaw) : [];
const rpcNames = new Set(existingRpcs.map((r) => r.name));

for (const dirName of listSubdirs(join(ROOT, "rpcs"))) {
  const dir = join(ROOT, "rpcs", dirName);
  const meta = readMetadata(join(dir, "metadata.json"));

  if (!rpcNames.has(meta.name)) {
    mk([
      "sdk-rpcs",
      "create",
      `--app-name=${APP_NAME}`,
      `--app-version=${APP_VERSION}`,
      `--name=${meta.name}`,
      `--label=${meta.label}`,
    ]);
    console.log(`  · created rpc "${meta.name}"`);
  } else {
    console.log(`  · "${meta.name}" exists`);
  }

  // Wire RPC → connection. Same reasoning as modules: `sdk-rpcs create`
  // doesn't take a --connection flag, only `update` does. Without this the
  // RPC fires at scenario-config time without the connection context, so
  // `{{connection.baseUrl}}` and `{{connection.apiKey}}` resolve to empty
  // strings and the dropdown silently returns no results.
  if (meta.connection) {
    const makeConnName = connectionNameMap[meta.connection];
    if (!makeConnName) {
      console.error(
        `  ✗ rpc "${meta.name}" declares connection="${meta.connection}" ` +
          `but no local connection with that name was deployed`,
      );
      process.exit(1);
    }
    mk([
      "sdk-rpcs",
      "update",
      `--app-name=${APP_NAME}`,
      `--app-version=${APP_VERSION}`,
      `--rpc-name=${meta.name}`,
      `--connection=${makeConnName}`,
    ]);
  }

  const apiPath = join(dir, "api.imljson");
  if (existsSync(apiPath)) {
    mk([
      "sdk-rpcs",
      "set-section",
      `--app-name=${APP_NAME}`,
      `--app-version=${APP_VERSION}`,
      `--rpc-name=${meta.name}`,
      "--section=api",
      `--body=${readBody(apiPath)}`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// 5. Groups — module order in the scenario picker
// ---------------------------------------------------------------------------
//
// Pushed AFTER modules exist (groups reference module names). Make re-sorts
// the auto-generated "Other" group by type, so an explicit, named-group
// `groups.json` is the only way to pin module order (e.g. keep Delete
// Attachment last). Optional file — skipped if absent.

const groupsPath = join(ROOT, "groups.json");
if (existsSync(groupsPath)) {
  console.log("\n─── Groups ───");
  mk([
    "sdk-apps",
    "set-section",
    `--name=${APP_NAME}`,
    `--version=${APP_VERSION}`,
    "--section=groups",
    `--body=${readBody(groupsPath)}`,
  ]);
}

console.log("\n✓ Deploy complete");
