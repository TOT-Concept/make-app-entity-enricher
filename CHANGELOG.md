# Changelog

All notable changes to the Entity Enricher Make.com app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ⚠ BREAKING — per-prompt fields and schema-generation property count renamed

- **Get Record** *Per-prompt details*: `prompt_used` is now `user_prompt` ("Prompt sent"), `system_prompt_used` is now `system_prompt` (`raw_response` unchanged). Scenarios mapping those fields must be re-mapped; the values are unchanged.
- **Generate Schema** output: `property_count` is now `sample_property_count` ("Sample property count") — the count was always taken from the input sample's properties, not from the generated schema.

### ⚠ BREAKING — record output field `llm_provider_name` is now `model_composite_key`

The field never held a provider name — it holds the model composite key (e.g. `anthropic::claude-sonnet-4-5`). Renamed in the **Get Record** and **List Records** output bundles (interface label is now "Model composite key"). **Existing scenarios mapping `llm_provider_name` must be re-mapped to `model_composite_key`;** the value is unchanged.

### ⚠ BREAKING — "Databases" is now "Database Sync"

The feature was named as though Entity Enricher hosted a database for you. It does not: it keeps *your own* PostgreSQL up to date by shipping SQL that a client you run applies. The module group and the identifiers are renamed to match:

| Was | Now |
|---|---|
| Module `listDatabases` ("List Databases") | Module `listDatabaseSyncs` ("List Database Syncs") |
| RPC `getDatabases` (the Database dropdown) | RPC `getDatabaseSyncs` |
| Group "Databases" | Group "Database Sync" |

**Existing scenarios that use List Databases keep pointing at the old module and must be re-created with List Database Syncs.** `fetchDatabaseDeltas` and `ackDatabaseDeltas` keep their names — only their descriptions changed — so scenarios using only those are unaffected.

**Maintainer step, required at release:** `scripts/deploy.mjs` only *creates* entities that are missing on the remote — it never deletes. After deploying this version, delete the obsolete `listDatabases` module and `getDatabases` RPC by hand in the Make Developer Hub. If you skip it, both the old and new modules stay published and Make buckets the orphans under "Other".

### Added
- **Typed failure code on Enrich Entity per-model results** — a new `error_code` output field (inside *Per-model results*) names why a model produced no result: `model_retired` (provider retired the model, now auto-deactivated — reselect and retry), `rate_limited`, `context_length_exceeded`, or `provider_timeout`. The backend now returns matching HTTP statuses (422/429/504) for these instead of a generic 502.

## [1.4.0] — 2026-07-21

### Changed
- **Multi-schema databases** — a schema database can now be linked to several saved schemas (shared entity types merge into the same tables, matched by database key). **List Databases** output rows replace the single `saved_schema_id`/`schema_content_hash` fields with a `schemas` array (schema ID, name, content hash, linked date per linked schema); the stale `locale` field was removed from the sample and the database dropdown label. **Fetch Database Deltas** batches may now include `kind: "schema"` DDL-migration rows — apply their `sql` like any other delta; they arrive before the data rows that need them.

## [1.3.0] — 2026-07-16

### Added
- **OAuth 2.0 connection** — connect with your Entity Enricher account instead of pasting an API key: pick *Entity Enricher OAuth 2.0* when creating a connection, sign in, and click **Authorize**. The connection acts on your behalf with your own role and can be revoked anytime from Entity Enricher → *API Keys → Connected Apps*. Implemented as OAuth 2.1 authorization code + PKCE with rotating refresh tokens; every module and dropdown RPC accepts either connection type (`altConnection`). The API-key connection remains available and is still the recommendation for durable service-to-service scenarios (it acts independently of any user account).
- Self-hosted instances can use the OAuth connection too: seed a confidential client via `AUTH_OAUTH_SEED_CLIENTS` (redirect URI `https://www.integromat.com/oauth/cb/app`) and fill the advanced *Client ID* / *Client Secret* connection fields.
- **Simpler Enrich Entity module by default** — the non-essential parameters (*Models*, *Attachment IDs*, *Strategy*, *Classification model*, *Arbitration model*) moved behind Make's **Show advanced settings** toggle, joining the existing advanced parameters. The default view now shows only *Entity data*, *Schema*, *Languages*, and *Web search*; with *Models* left empty, Entity Enricher runs with your organization's best model (pinned default or top benchmark score). The Web search "On" label now reads "applies when the auto-selected model supports web search" when no models are selected, instead of the misleading "no selected model supports web search".

### Changed
- **Benchmark scores in the Models dropdown** — when your organization has scoring-source benchmark scenarios configured, each model label in the `getModels` RPC now appends the overall benchmark score and a Quality/Speed/Cost breakdown (0–100), e.g. `GPT OSS 120B ★82 (Q88 S90 C55), in $0.17, out $0.66`. Models without scores keep their previous label.

## [1.2.1] — 2026-06-05

### Fixed
- **Capability dropdowns failed to load** — the `getResponseSchemaOptions`, `getStrictStructuredOutputOptions`, and `getWebSearchOptions` RPCs used a non-existent `filter()` IML function, so the **Response schema**, **Strict structured output**, and **Web search** dropdowns showed "Failed to load data!" (`Function 'filter' not found`). Rewrote them to use Make's built-in `map(array; key; filterKey; possibleValues)` filtering. The web-search variant had carried this latent bug since 1.0.0.

### Changed
- **Attachment IDs** on `Enrich Entity` moved out of the advanced section to a primary parameter directly after **Models**, so attachment mapping is visible without expanding advanced options.

## [1.2.0] — 2026-06-04

### Added
- **Upload Attachment** module — upload a file as `multipart/form-data` via `POST /api/attachments`. Map a file/buffer output from an upstream module (e.g. HTTP ▸ Get a File, Google Drive ▸ Download a File) into its *File* field. Returns the attachment `id`, MIME type, mode (`inline_text` / `binary`), and required model capability.
- **Delete Attachment** module — permanently remove an attachment from the server via `DELETE /api/attachments/{id}`. Use as a cleanup step after a successful enrichment.
- **Attachment IDs** parameter on `Enrich Entity` (advanced) — map one or more Upload Attachment `id` outputs so the uploaded files are used as source material for the enrichment.

## [1.1.0] — 2026-05-31

### Added
- **Response schema** and **Strict structured output** dropdowns on `Enrich Entity` (advanced parameters), backed by the new `getResponseSchemaOptions` / `getStrictStructuredOutputOptions` RPCs. Each option only offers "On" when at least one selected enrichment model declares the matching capability (`supports_response_schema` / `supports_strict_structured_output`); otherwise it locks to "Off". Response schema defaults on; strict structured output defaults off. Mirrors the n8n connector and web app behaviour.
- **Record origin tracking** — requests send an `X-Client-Origin` header so enrichment records created via Make are tagged `origin="make"`.

### Fixed
- **Dropdown persistence** — switched RPC-backed dropdowns to the `options.store` pattern so selected values persist across module reconfiguration.
- **Connection & RPC hardening** — fixed API requests and dynamic dropdown IML so the connection test and `loadOptions` calls succeed reliably.

## [1.0.0] — 2026-05-14

### Added
- Initial public release. Custom App for [Entity Enricher](https://entityenricher.ai).
- **7 modules** across 4 categories:
  - **Enrichment** — `Enrich Entity` (action, calls `POST /api/single/enrich/sync`; auto-fuses 2+ models server-side; returns the final fused or best-single-model result in a single HTTP response).
  - **Schemas** — `List Schemas` (search), `Get Schema Details` (action).
  - **Records** — `List Records` (search), `Get Record` (action).
  - **Fusion** — `Merge Results` (action, re-merge with optional LLM arbiter).
  - **Configuration** — `Get Options` (action, models / languages / strategies / plan limits).
- **7 RPCs** for dynamic dropdowns: `getSchemas` (📌 pinned first), `getModels` (with per-million-token pricing), `getClassificationModels`, `getArbitrationModels`, `getLanguages` (40 supported), `getStrategies`, `getWebSearchOptions` (locks to "Off" when no selected model supports web search).
- **Typed error contract** in `base.imljson` mapping every backend HTTP status to a Make error type: `DataError` (400/422), `InvalidCredentials` (401), `OutOfMoneyError` (402 — echoes backend `detail.code` for branchable handling), `AccessDeniedError` (403), `InvalidConfigurationError` (404), `RateLimitError` (429), `RuntimeError` (499), `ConnectionError` (502/504 timeout).
- **Multilingual output in a single LLM pass** for 40 languages, surfaced via the `Languages` multi-select.
- **Auto-fusion** when 2+ models are selected: response includes `is_fused`, `source_models[]`, and a `fusion: {agreed_fields, conflicted_fields, total_fields}` summary.
- **Pre-flight classification** option to verify entity-type before enrichment runs (avoids hallucinated data on mismatched entities).
- **Plan-limit awareness**: HTTP 402 responses are surfaced as `OutOfMoneyError` with both human-readable message and machine-readable code (`insufficient_credits`, `model_limit_exceeded`, `language_limit_exceeded`, `concurrent_job_limit_reached`, etc.) so scenarios can branch programmatically.
- **API Key connection** (`X-API-Key` header), auto-tested against `/api/enrichment/options` on save.
- **1024×1024 `icon.png`** auto-generated from the n8n connector's source SVG via the repo-root `scripts/update-logo.ts`.
- Bundled response **samples** for each module so the output mapper populates before the first scenario run.
- Make CLI wired as a `devDependency` (`@makehq/cli@^1.4.0`) with convenience scripts (`pnpm run mk*`).
- Local `scripts/validate.mjs` validator covering JSON/IMLJSON syntax and app-shape invariants (`pnpm run validate`).
- Idempotent `scripts/deploy.mjs` that walks the directory and pushes every section (modules, RPCs, connections, base, common, samples, docs).
