# Entity Enricher — Make.com Custom App

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Make.com](https://www.make.com) Custom App for [**Entity Enricher**](https://entityenricher.ai) — an AI-powered platform that **enriches any entity against a JSON schema using multiple LLMs in parallel**, with automatic fusion, **multilingual output in 40 languages**, and pre-flight classification.

> Drop a single Make module into any scenario, map an entity from a previous step, and receive a structured, schema-validated, multi-model-fused JSON object. No SSE handling, no retry plumbing, no prompt engineering.

<!-- TODO: replace with the actual demo asset once recorded
     Filename convention follows the n8n connector: demo-<flow>-make-connector.{webm,gif}
     Suggested: a 30-60s screen capture of a simple Make scenario:
       webhook trigger → Enrich Entity → return result -->
![Demo: enriching an entity inside a Make scenario](https://entityenricher.ai/docs/demo-single-enrichment-make-connector.gif)

---

## What is Entity Enricher?

Entity Enricher treats LLMs as **queryable knowledge bases**. You define a JSON schema describing the data you want — fields, types, descriptions, expertise domains — and Entity Enricher orchestrates one or more LLM providers (Anthropic, OpenAI, Google Gemini, DeepSeek, Cohere, Ollama, …) to fill it in. The output is validated against your schema, deduplicated across models, and stored for analytics.

### What makes it different

- **Multilingual by design** — 40 supported languages. A single property can carry localized values (`{en: "...", fr: "...", de: "...", ja: "..."}`) populated **in a single LLM pass** — not N sequential round-trips per language. This is a core capability of the platform, not an afterthought.
- **Multi-model fusion** — Run an entity through 2+ models in parallel; conflicts are resolved field-by-field via a deterministic merger or an LLM arbiter, with a per-field agreement report.
- **Pre-flight classification** — A cheap classifier model verifies the entity matches the schema's expected type *before* expensive enrichment runs. Mismatches are surfaced as warnings instead of producing hallucinated data.
- **Expertise-driven prompts** — Schemas can group properties by expertise domain (e.g. "financial", "regulatory"). The `multi_expertise` strategy runs one focused LLM call per domain in parallel, producing higher-quality results for large schemas.
- **AI schema generation with self-correction** — Paste sample data, get a validated schema back; the LLM uses Pydantic-AI's `ModelRetry` to self-correct invalid output.
- **Cost & quality analytics** — Per-model and per-provider cost tracking, success rates, and benchmark comparisons in a built-in dashboard.
- **REST API with role-based access** — Personal and organization access keys, scoped permissions, plan-based quotas.

### Powered by

Anthropic, OpenAI, Google Gemini, DeepSeek, Cohere, Mistral, X.AI, Ollama (self-hosted), and any other provider you bring keys for. Use platform-pooled keys (Entity Enricher manages quota/billing) or your own keys (BYOK pricing).

Learn more: [entityenricher.ai](https://entityenricher.ai) · [Documentation](https://entityenricher.ai/docs) · [Architecture](https://entityenricher.ai/docs/concepts)

---

## What this Make app does

This app exposes Entity Enricher's REST API as **7 first-class Make modules** with dynamic dropdowns, plan-limit-aware error handling, and one-call enrichment (no SSE plumbing on the Make side).

| Category | Module | Endpoint | Type |
|---|---|---|---|
| **Enrichment** | Enrich Entity | `POST /api/single/enrich/sync` | Action |
| **Schemas** | List Schemas | `GET /api/schema/saved` | Search |
| **Schemas** | Get Schema Details | `GET /api/schema/saved/{id}` | Action |
| **Records** | List Records | `GET /api/records` | Search |
| **Records** | Get Record | `GET /api/records/{id}` | Action |
| **Fusion** | Merge Results | `POST /api/fusion/merge` | Action |
| **Configuration** | Get Options | `GET /api/enrichment/options` | Action |

**Why one-call enrichment.** Entity Enricher's primary public endpoint is a Server-Sent Events stream, which Make modules can't consume natively. We added a dedicated `POST /api/single/enrich/sync` endpoint server-side that wraps the streaming flow internally and returns the final fused result in a single HTTP response — so each Make operation = one bundle, no polling, no two-module patterns.

**Why no batch module.** Make scenarios bill per operation. To process N entities, use Make's built-in **Iterator** + this app's *Enrich Entity* — that pattern is cheaper, more transparent, and gives users granular per-entity error handling (vs. a single batch module that fails opaquely if one entity errors out).

---

## Installation

> **Status:** This app is currently in v0.1.0 scaffolding stage. The connection works; modules are deployed via the Make Developer Hub.

### Sideloading from the Make Developer Hub

1. Sign in to your Make organisation as a developer.
2. Go to **Apps → Create a new app → Custom App**.
3. Either upload this directory as a `.zip`, or paste the contents of each `.json` / `.imljson` file into the corresponding tab in the editor.
4. Add an **API Key connection**: paste a key from Entity Enricher → *Settings → API Keys*. The connection auto-tests against `/api/enrichment/options`.

### Marketplace install (once published)

> Coming with v1.0 — the app will be submitted to the Make.com public marketplace.

## Authentication

Two authentication methods are planned:

| Method | Status | Best for |
|---|---|---|
| **API Key** (`X-API-Key`) | ✅ v0.1.0 | Service-to-service integrations. Use an *Organization Access Key* to act independently of any user. |
| **OAuth 2.0** | 🚧 v0.4 | End-user scenarios where each Make user connects their own Entity Enricher account. Requires Entity Enricher's authorization server (in flight). |

API keys are created in *Settings → API Keys* (format: `ent_XXXXXXXXXXXX`). The connection's *Base URL* defaults to `https://entityenricher.ai` and only needs to change for self-hosted deployments.

---

## Quickstart — Enrich a single entity

```
[any trigger]  ─►  Enrich Entity (this app)  ─►  [downstream module]
                       │
                       ├ Schema:    📌 Pharmaceutical Company
                       ├ Models:    Claude Sonnet 4.5 + GPT-4o
                       ├ Languages: en, fr, de, ja
                       ├ Strategy:  multi_expertise
                       └ Entity:    {{trigger.json}}
```

The module auto-fuses results when 2+ models are picked, returning a single merged object plus a `fusion: {agreed_fields, conflicted_fields, total_fields}` summary.

<!-- TODO: replace with actual screenshot — Make.com scenario with the Enrich Entity module configured as above.
     Filename convention follows the n8n connector: MakeConnector<View>-{light,dark}.png
     Suggested: side-by-side scenario panel + module configuration drawer -->
![Make scenario: Enrich Entity module configuration](https://entityenricher.ai/docs/MakeConnectorEnrichEntity-light.png)

## Multilingual enrichment

Pick more than one language and Entity Enricher will populate every multilingual property in **all selected languages in a single LLM call** — not N round-trips per language. Localized values come back as a flat `{en, fr, de, ...}` object inside each property:

```jsonc
// One Enrich Entity call with languages = ["en", "fr", "de", "ja"]
{
  "names": {
    "primary": {
      "en": "Aspirin",
      "fr": "Aspirine",
      "de": "Aspirin",
      "ja": "アスピリン"
    }
  },
  "indications": {
    "en": "Pain, fever, inflammation; antiplatelet therapy.",
    "fr": "Douleur, fièvre, inflammation ; antiagrégant plaquettaire.",
    "de": "Schmerz, Fieber, Entzündung; Thrombozytenaggregationshemmer.",
    "ja": "痛み、発熱、炎症；抗血小板療法。"
  }
}
```

Downstream Make modules can map any language directly: `{{enrichEntity.result.names.primary.fr}}`. The 40 supported languages cover the major European, Asian, Middle Eastern, and African markets — see the full list in the *Languages* dropdown of the Enrich Entity module.

<!-- TODO: replace with actual screenshot — Languages multi-select dropdown showing all 40 options with the plan-limit notice if applicable. -->
![Make module: Languages dropdown with 40 supported languages](https://entityenricher.ai/docs/MakeConnectorLanguages-light.png)

## Multi-entity scenarios — Iterator pattern

```
[trigger: array of entities]
   │
   ▼
[Make: Iterator]   (splits into N bundles)
   │
   ▼
[this app: Enrich Entity]   (one operation per entity)
   │
   ▼
[Make: Aggregator]   (re-collects results, optionally with skip-on-error)
   │
   ▼
[downstream: upsert to CRM / database]
```

Each iteration is independent — failures of one entity don't abort the others, and Make's per-operation billing reflects exactly how much was processed.

<!-- TODO: replace with actual screenshot — full Make scenario with Iterator → Enrich Entity → Aggregator → downstream. -->
![Make scenario: Iterator pattern for multi-entity enrichment](https://entityenricher.ai/docs/MakeConnectorIteratorPattern-light.png)

## Plan-limit awareness

Profile-limited orgs see structured 402 errors when they exceed quota — Make surfaces these as typed `OutOfMoneyError` with the limit code, used count, and remaining. Branch on this in your scenario to fall back to a cheaper model, alert a human, or wait for the quota window to reset.

<!-- TODO: replace with actual screenshot — Make scenario error handler routing on OutOfMoneyError to a Slack alert + scenario stop. -->
![Make scenario: error handler branching on OutOfMoneyError](https://entityenricher.ai/docs/MakeConnectorErrorHandling-light.png)

## Layout

```
make-app-entity-enricher/
├── app.json                          # App metadata (name, label, theme, version)
├── base.imljson                      # Shared HTTP defaults + global error handler
├── icon.png                          # 256×256 (TODO: regenerate from source SVG)
├── connections/
│   └── apiKey/                       # X-API-Key auth, /enrichment/options test
├── modules/
│   ├── enrichEntity/                 # The central action (calls /enrich/sync)
│   ├── listSchemas/  getSchemaDetails/
│   ├── listRecords/  getRecord/
│   ├── mergeResults/
│   └── getOptions/
├── rpcs/                             # 7 dynamic dropdown sources
│   ├── getSchemas/  getModels/
│   ├── getClassificationModels/  getArbitrationModels/
│   ├── getWebSearchOptions/         # depends on selected models
│   ├── getLanguages/  getStrategies/
├── webhooks/                         # (v0.3 — instant trigger receivers)
├── functions/                        # (reserved for IML helpers)
├── scripts/validate.mjs              # Local JSON/IMLJSON syntax + app-shape check
└── package.json README.md LICENSE CHANGELOG.md .gitignore
```

## Development

The app is developed in the [Entity Enricher monorepo](https://github.com/TOT-Concept/EntityEnricher) under `connectors/make/make-app-entity-enricher/` and synced (read-only) to [TOT-Concept/make-app-entity-enricher](https://github.com/TOT-Concept/make-app-entity-enricher) via a GitHub Actions subtree workflow on every push to `main`. Open contributions land on the monorepo, not the public mirror.

### Local validation

```bash
pnpm install   # first time only — also installs the Make CLI (see below)
pnpm run validate
# Walks every .json / .imljson, parses each, checks app-shape invariants
```

The local validator catches JSON / IMLJSON syntax mistakes and missing required files. It does **not** validate IML expressions semantically — for that, use Make's tooling:
- The "Make Apps Editor" VS Code extension validates IML expressions live.
- [Make Developer Hub](https://www.make.com/en/help/apps/about-the-developer-hub)'s editor flags schema errors when you save.

### Make CLI

The official Make CLI ([`@makehq/cli`](https://www.npmjs.com/package/@makehq/cli)) is installed as a `devDependency`, so `pnpm install` provisions it for the whole team at the version pinned in `pnpm-lock.yaml`. **No global install needed.**

| Script | Equivalent | Purpose |
|---|---|---|
| `pnpm run mk:login` | `make-cli login` | Save your Make API key locally (run once per machine) |
| `pnpm run mk:whoami` | `make-cli whoami` | Confirm you're authenticated |
| `pnpm run mk:apps` | `make-cli sdk-apps list` | List the SDK apps in your Make account |
| `pnpm run mk -- <args>` | `make-cli <args>` | Any other CLI subcommand. Mind the `--` so pnpm forwards args. |

Full subcommand tree: `pnpm run mk -- --help`.

Pushing a section to a remote dev app (the CLI is granular — it operates per section, not "deploy entire folder"):

```bash
pnpm run mk -- sdk-apps set-section \
  --name=entity-enricher --version=1 --section=base \
  --body="$(cat base.imljson)"

pnpm run mk -- sdk-modules update \
  --app-name=entity-enricher --app-version=1 \
  --module-name=enrichEntity --section=api \
  --body="$(cat modules/enrichEntity/api.imljson)"
```

A wrapper script that walks the entire local directory and pushes every section/module/RPC in one shot is on the roadmap below — for now it's manual per section while we iterate.

### Alternative install methods (if you skip the project-tracked dep)

```bash
brew install integromat/tap/make-cli   # macOS / Linux via Homebrew
npm  i -g @makehq/cli                  # Node-based global
```

The project-tracked devDependency is preferred because the version is pinned across the team and CI.

### Updating the icon

The brand icon source-of-truth is [`connectors/n8n/.../entity-enricher.svg`](../../n8n/n8n-nodes-entity-enricher/nodes/EntityEnricher/entity-enricher.svg). The repo-root [`scripts/update-logo.ts`](../../../scripts/update-logo.ts) renders that single SVG into every needed asset — including this app's `icon.png` at 1024×1024 (Make's Developer Hub requires a square PNG between 512×512 and 2048×2048, ≤500 kB). To regenerate after editing the source SVG:

```bash
cd scripts && pnpm run update-logo
```

The script updates favicons, badge SVGs, the n8n node's cleaned SVG, and `connectors/make/make-app-entity-enricher/icon.png` in one pass. Don't edit `icon.png` by hand — it's overwritten on the next run.

## Roadmap

- ✅ **v0.1** — Scaffolding, app metadata, base HTTP config, API-key connection, validator.
- 🚧 **v0.2** — 7 modules + 7 RPCs, Make CLI wired as a devDependency, brand icon (this release).
- ⏳ **v0.2.1** — `scripts/deploy.mjs` wrapper that walks the local directory and pushes every section/module/RPC to a remote dev app in one command. Removes the per-section CLI ritual.
- ⏳ **v0.3** — Instant trigger module (`On Enrichment Record`) once the backend webhook system is live.
- ⏳ **v0.4** — OAuth 2.0 connection alongside API-key, once the backend authorization server is live.
- ⏳ **v1.0** — Submission to the Make.com public marketplace.

## License

MIT — see [LICENSE](LICENSE).

---

> Built by [TOT Concept](https://entityenricher.ai). Questions or feedback: [contact@entityenricher.ai](mailto:contact@entityenricher.ai).
