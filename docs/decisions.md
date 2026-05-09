# Architectural Decisions

Index of Architectural Decision Records (ADRs). Each ADR lives in [`./adr/`](./adr/) as a standalone file. Click through for the full record; some ADRs also link to a companion design doc for long-form analysis.

## How to add a new ADR

- **Number:** next sequential `NNNN`, zero-padded to 4 digits.
- **Filename:** `docs/adr/NNNN-kebab-title.md`.
- **Shape:** 4 sections — Context, Decision, Alternatives Considered, Consequences. Include a `Date:` line; add `Status:` only when it's load-bearing (Proposed / Deferred / Superseded). Accepted is the default and is implicit.
- **Design doc:** if content exceeds ~100 lines or needs diagrams, option analysis, or capacity math, split the long-form content into `docs/adr/NNNN-slug-design.md` and keep the ADR compressed. Link the design doc from the ADR's **See Also** section.
- **Index:** add a new row as the *first* entry below, keeping this index in reverse-chronological order.

## Index (newest first)

| ADR | Date | Summary |
|-----|------|---------|
| [ADR-0001](./adr/0001-deterministic-plugin-builds.md) (+ [plan doc](./plans/ci-bundle-freshness.md)) | 2026-05-09 | Make plugin builds deterministic by replacing the HEAD-sha cache-bust with a content hash of the plugin's source tree, enabling a single CI workflow with `git diff --exit-code marketplaces/monorepo-marketplace/` to enforce source/bundle parity on every PR. **Status: Proposed.** |
