# Changelog

All notable changes to the Entity Enricher Make.com app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — key collisions: the last item wins, and each entry says whether anything was lost

When two items of one list claim the same database key, the **last** one is now written and the earlier ones dropped — the same last-write-wins rule the entity layer applies between enrichments (it used to keep the first). Every `key_collisions` entry in the *Database sync outcome* gains `kept_path` (the sibling written instead), a `kind` — `duplicate` when both items agreed on every value they answered (nothing lost), `conflicting` when some non-key value differs — and `differing_fields` naming what a conflicting drop lost. A `conflicting` entry is either the model repeating one thing with a noisy value, or two real things behind one key value (a regional variant, an annual edition): the fix for the latter is marking the discriminating property `identifying` before publishing. The list is also stored on the record, so a `partial` write still says what it lost after the response is gone.

### Changed — Generate Sample takes one **Request** instead of Entity type + Fields + Extra instructions

Generate Sample used to split what you wanted across three parameters: a required **Entity type**, an optional **Fields** list, and free-form **Extra instructions** appended to the prompt. The API now takes a single free-text `request` — the kind of entity, the properties to include, any size or depth budget, structural preferences — and the module exposes it as one multi-line **Request** field. It is binding for the generation: an explicit budget beats the generator's default exhaustiveness, a requested shape beats its default choice (the split was exactly what let a budget lose to the defaults). The kind of entity is now derived by the model from the request and returned as `object_type` in the response. **Request** is required unless **Attachment IDs** is set — there the document is the request and the text only narrows what to extract. Since the module runs a blocking call, an ambiguous request is resolved with its most standard reading rather than paused on (the web UI and MCP clients get asked instead).

**Migration:** put the old Entity type on the first line of Request, then the former Extra instructions below it; name any must-have fields in the text. A scenario that still maps the removed parameters has them ignored; an empty Request without attachments fails with a clear error.

### Changed — the schema flag `is_key` is now `identifying`

The property-level flag naming the values that identify an object was called `is_key`, which read as "primary key" — the one thing it is not. It never enforced uniqueness (that is `unique_group`), it is not the database row key (that is `database_key`), and it is not caller-owned (that is `preserve`). What it actually selects is the subset of properties whose values *match one instance of a thing to another* — across input and output items, across models during fusion, and against the semantic-ID concept registry. It is now spelled **`identifying`**, beside `database_key` (row identity) and `semantic_id` (concept identity).

The rename is a clean break, applied everywhere at once: schemas returned by the API carry `identifying`, and every stored schema was rewritten. A scenario that reads `is_key` off a schema property (a Set or filter over Get Schema Details output) must read `identifying` instead.

### Removed — Generate Schema: **Extra instructions**

The API no longer accepts `extra_instructions` on schema generation, so the field is gone from Generate Schema. The schema's structure is derived deterministically from the input samples, and per-property flags come from dedicated classification calls — free-form guidance had nothing left to steer and could only fight those rules. To shape the schema's *content*, put the guidance on **Generate Sample** (its Extra instructions field stays); to localize specific properties, set `multilingual` on them after generation in the schema editor. A scenario that had filled the field keeps running — the value is simply no longer sent.

### Added — `identity_underidentifies` on the database sync outcome

Enrich Entity, Merge Results and Sync Records to Database map a new `identity_underidentifies` array: shared-row overwrites in which **every** value both objects answered disagreed with the stored row. That pattern is not an update — it is a *different* real-world object wearing the same identity text (five stadiums all named "Olympic Stadium" collapsing onto one row), and its values just replaced the stored object's. The write still goes through (last write wins); each entry names the `entity_type`, `path`, the shared `keys`, the `semantic_id` concept now holding both objects' state, and the `compared_fields` count. The fix is identity, not data: compose a disambiguating property into the schema's identity (`semantic_source_keys`), or curate the concept on the Semantic IDs page. Ordinary partial disagreements keep reporting as `shared_entity_conflicts` only.

### Added — `detached_references` on the database sync outcome

A `skip_row` database used to refuse an entity outright when a **shared 1-1 reference** it points at was itself incomplete — one unknown field on a reused entity discarded the whole enrichment. Such a reference is now **detached** instead: the entity is written, the referenced target is neither written nor updated, and the saved row's foreign key is NULL. Enrich Entity, Merge Results and Sync Records to Database map the new `detached_references` array, and `status` reads `partial` for it exactly as it does for `skipped_items` — a different loss from a dropped row (the row IS there, the link is not), so it is mapped as its own field rather than folded in.

### Added — Enrich Entity / Merge Results say which model arbitrated

Enrich Entity's **Fusion summary** carried only the three counters, so a scenario that set an **Arbitration Model** could not tell whether that model actually decided the conflicts. It now also maps `method` (`llm` | `rule_based`) and `arbitration_model` — `rule_based` on a run that requested an arbiter means that call failed and the deterministic rules stood. Merge Results likewise exposes `arbitration_model_used`, which the API already returned but the module never mapped.

### Changed — Generate Sample: **Language** defaults to `auto`

The **Language** field of Generate Sample was `en`, so every generated sample came back in English whatever language the scenario was written in. It now defaults to `auto`, which the API reads as "no language requested": it infers the language from the **Entity Type** and **Typical Objects** you wrote (else the attached document's, else English) — field names and values alike — and the schema built from that sample follows the sample's own property names. An explicit code (`en`, `fr`, …) still forces one language as before.

### Added — `examples/` blueprints, and docs that match the app

Six importable scenario blueprints under [`examples/`](examples/), with a walkthrough README: single enrichment, the Iterator batch, **a PDF as source material**, **a photo → sample → schema**, three samples → a saved schema, and draining the delta feed into your own PostgreSQL (the Make counterpart of the platform's end-to-end sync test). They ship with placeholders instead of ids and no connection, and reference the published `entity-enricher:` module namespace — sideloaded copies need it renamed to `app#entity-enricher-<suffix>:` before importing.

The README and the in-app documentation (`help.md`) were refreshed to the app as it stands: they still described the 1.0 app (7 modules, 4 categories, API-key connection only) and said nothing about schema authoring, attachments, auto model selection, the database-sync trio, or the `database` outcome block on Enrich Entity / Merge Results.

### Changed — record-level `attempts` replaced by `retries`

**List Records** no longer maps `attempts` (total LLM call attempts); it maps **`retries`** instead — the attempts beyond the first per prompt (`0` when every call succeeded first try), now computed server-side. A scenario that mapped `attempts` should map `retries` (or `prompt_count + retries` to reconstruct the old total). **Get Record** gains the same record-level `retries` field plus a per-prompt `retries` next to the unchanged per-prompt `attempts`.

### Removed — Generate Schema "Strategy" field

The single-call (monolithic) schema-generation pipeline was retired server-side; generation always uses the multi-step (staged) pipeline. The **Strategy** select is removed from **Generate Schema** and the `generation_strategy` request field no longer exists. Existing scenarios that had it set keep working — the stored value is simply ignored.

### Added — database sync outcome tells a partial write from a whole one

*Database sync outcome* now maps a **`status`** field: `saved` (everything the run produced was written), `partial`, or `rejected`. **`partial`** means the entity landed but some of its rows did not — items dropped by a `skip_row` database (`skipped_items`) or dropped as duplicate identities (`key_collisions`) — and *nothing re-sends them*: the rows stay missing until the schema is fixed and the entity re-enriched. A router filtering on `saved = true` treated that case as a clean success; filter on `status` instead. `reason` and `missing_fields` are now filled on a partial write too (the unfilled non-nullable path is the schema gap that caused each drop), and their labels changed accordingly.

### Added — database sync outcome exposes dropped rows

**Enrich Entity** and **Merge Results** now map three more fields under *Database sync outcome*:

- `key_collisions` — list items that claimed a database key an earlier sibling already had. Only the first is written (one key = one row downstream), and each entry names the `entity_type`, the `path` of the dropped item, and the `kept` / `dropped` identifying values so a fabricated or non-discriminating id is visible instead of silently collapsing two rows into one.
- `shared_entity_conflicts` — shared (non-owned) rows whose stored values this run overwrote while at least one *other* parent still links to them. Each entry names the `entity_type`, `path`, `keys` and `other_parents` count plus every overwritten `property` with its `previous` / `incoming` value. Usually it means the nested object holds per-parent data (a rating measured for *this* entity) and the relationship should be marked owned.
- `skipped_items` — array items dropped by a `skip_row` database; the field was already returned by the API but was missing from the output bundle.

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
