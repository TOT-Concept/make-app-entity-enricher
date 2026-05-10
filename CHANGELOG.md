# Changelog

All notable changes to the Entity Enricher Make.com app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial scaffolding: app metadata, base HTTP config, API-key connection.
- 7 modules (`enrichEntity`, `listSchemas`, `getSchemaDetails`, `listRecords`, `getRecord`, `mergeResults`, `getOptions`) and 7 RPCs (`getSchemas`, `getModels`, `getClassificationModels`, `getArbitrationModels`, `getLanguages`, `getStrategies`, `getWebSearchOptions`).
- 256×256 `icon.png` auto-generated from the n8n connector's source SVG via the repo-root `scripts/update-logo.ts` (run with `pnpm run update-logo`).
- Make CLI wired as a `devDependency` (`@makehq/cli@^1.4.0`). Convenience scripts: `pnpm run mk`, `mk:login`, `mk:whoami`, `mk:apps`. No global install required.
- Local `scripts/validate.mjs` validator covering JSON/IMLJSON syntax and app-shape invariants (`npm run validate`).
