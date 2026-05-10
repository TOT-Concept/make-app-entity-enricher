#!/usr/bin/env node
/**
 * Minimal local validator for the Make.com app source.
 *
 * Make's IMLJSON format is plain JSON with `{{expression}}` substitutions
 * inside string values. This script:
 *   1. Walks every `.json` and `.imljson` file in the app directory.
 *   2. Parses it as JSON (which works because all our IML substitutions are
 *      inside string values — Make does no special preprocessing here).
 *   3. Reports any parse errors, plus a few app-shape sanity checks
 *      (top-level files exist, connection metadata has required fields, etc.).
 *
 * This is *not* a substitute for running Make's own validator (via the VS Code
 * extension or the Developer Hub editor) — it just catches the most common
 * syntax mistakes locally before pushing.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const REQUIRED_FILES = [
  "app.json",
  "base.imljson",
  "README.md",
  "LICENSE",
  "package.json",
];

const errors = [];
const warnings = [];

/** Recursively collect every *.json / *.imljson under `dir`. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".git")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (extname(entry) === ".json" || extname(entry) === ".imljson") {
      out.push(full);
    }
  }
  return out;
}

// 1. Required top-level files
for (const f of REQUIRED_FILES) {
  if (!existsSync(join(ROOT, f))) {
    errors.push(`Missing required file: ${f}`);
  }
}

// 2. Parse every JSON / IMLJSON file
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  try {
    JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${rel}: invalid JSON — ${e.message}`);
  }
}

// 3. App metadata sanity
try {
  const app = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8"));
  for (const k of ["name", "label", "version", "theme"]) {
    if (!app[k]) errors.push(`app.json missing required field: ${k}`);
  }
  if (app.theme && !/^#[0-9a-fA-F]{6}$/.test(app.theme)) {
    warnings.push(`app.json theme "${app.theme}" is not a 6-digit hex colour`);
  }
} catch {
  // already reported as parse error above
}

// 4. Connection sanity — every connections/<name>/ must have metadata.json
const connectionsDir = join(ROOT, "connections");
if (existsSync(connectionsDir)) {
  for (const entry of readdirSync(connectionsDir)) {
    const sub = join(connectionsDir, entry);
    if (!statSync(sub).isDirectory()) continue;
    const meta = join(sub, "metadata.json");
    if (!existsSync(meta)) {
      errors.push(`connections/${entry}/metadata.json missing`);
      continue;
    }
    try {
      const m = JSON.parse(readFileSync(meta, "utf8"));
      if (!m.name) errors.push(`connections/${entry}/metadata.json missing 'name'`);
      if (!m.label) warnings.push(`connections/${entry}/metadata.json missing 'label'`);
    } catch {
      // already reported
    }
  }
}

// 5. Icon — recommend 256x256 png
if (!existsSync(join(ROOT, "icon.png"))) {
  warnings.push(
    "icon.png missing — Make.com expects a 256x256 PNG. " +
      "Generate from connectors/n8n/.../entity-enricher.svg via " +
      "frontend/scripts/update-logo.ts.",
  );
}

// Report
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(
  `\n${errors.length} error(s), ${warnings.length} warning(s) across ` +
    `${walk(ROOT).length} JSON/IMLJSON files.`,
);
process.exit(errors.length > 0 ? 1 : 0);
