# Decision records

Short documents that capture a significant technical decision — its context, the
choice made, the reasoning, and the consequences. One file per decision, numbered
and append-only. (This format is commonly called an **Architecture Decision
Record**, or ADR.)

Records are immutable once accepted. A later decision that changes an earlier one
is added as a new record that supersedes it, rather than editing the old one — so
the history of *why* stays intact.

- [0001 — Backend-agnostic package boundary](0001-package-boundary.md)
- [0002 — Game-agnostic cores behind a game-adapter interface](0002-game-adapter-pattern.md)
- [0003 — Stored board layouts, not reproducible seeds](0003-stored-boards-not-seeds.md)
