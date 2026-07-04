# 0001. Backend-agnostic package boundary

**Status:** Accepted · **Repo:** cozy-games · **Date:** 2026-07

## Context
cozy-games is a collection of reusable game modules (`@ayo-run/mnswpr`, the
leaderboard package, future extractions). Applications built on these packages
differ in how they store data, authenticate users, and enforce rules.

## Decision
Packages in this repo are **backend-agnostic and permission-agnostic**: they
expose capability, never storage or authorization. Any backend — database, auth,
server-side logic — is supplied by the consuming application through injected
adapters and hooks (see 0002). Package code contains no storage-, deployment-, or
authorization-specific logic.

## Rationale (technical)
- Permission-agnostic packages are correct library design: authorization and
  storage belong to each deployment (e.g. via security rules and server-side
  contexts), not to library code.
- Backend-agnostic packages are more adoptable, testable, and contributable; any
  app or backend can consume them.
- Standalone packages are more reusable and testable than a monolithic app.

## Consequences
- Public API changes in these packages are semver events for downstream consumers.
- Contributions must not introduce coupling to any specific backend or deployment.
- These decision records cover package and architecture decisions only; storage,
  deployment, and operations choices belong to each consuming application, not to
  this repo.
