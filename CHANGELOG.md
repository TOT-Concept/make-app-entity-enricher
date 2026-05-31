# Changelog

All notable changes to the Entity Enricher Make.com app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
