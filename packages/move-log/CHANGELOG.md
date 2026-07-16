# Changelog

## 0.1.0 — envelope realigned to ADR-002 §1 (BREAKING, pre-freeze)

**Intentional breaking change.** Safe now because no production logs have been
recorded yet (the downstream consumer, cozy-platform, ships dark pre-cutover).
Once real games write logs the format is permanent, so this had to land first.

The envelope now matches cozy-games **ADR-002 §1** and the cozy-platform
implementation that proved it (S0-102 round-trip replay) — **while keeping the
generics** that let a second game reuse the package untouched:

- **Entry shape:** `{ seq, t, event: T }` → `{ seq, clientTs, type, payload, receivedTs? }`.
  The game event splits into the ADR's surfaced `type` **discriminator** plus an
  OPAQUE `payload`. (`t` → `clientTs`.) `receivedTs?` is unchanged (optional, additive).
- **Generics kept & strengthened:** `MoveEvent<T>` / `MoveLog<T>` →
  `MoveEvent<TType extends string = string, TPayload = unknown>` /
  `MoveLog<TType extends string = string, TPayload = unknown>`. Minesweeper
  instantiates `MoveLog<'reveal'|'flag'|'unflag'|'chord', { r, c }>`; a second game
  supplies its own params with no package change. The defaults give game-blind
  code the erased (`string` / `unknown`) form. Shipped as generic `.d.ts`.
- **`schema_version`:** package-owned number `1` → a **caller-supplied string**
  naming the game's move-event vocabulary (e.g. `"mnswpr-moves/1"`), carried
  verbatim (ADR §2). The `SCHEMA_VERSION` export and the numeric container-version
  concept are removed.
- **`createMoveLog(schemaVersion, events?)`** now takes the vocabulary version as
  its first argument.
- **`assertMoveLog`** enforces the new invariants (non-empty string
  `schema_version`; integer strictly-increasing `seq`; finite `clientTs`;
  non-empty string `type`; **present** `payload` — any value, never inspected;
  finite `receivedTs` when present) and still rejects without mutating.

Helpers (`isMoveLog`, `serializeMoveLog`, `deserializeMoveLog`, `withReceivedTs`)
are kept and adapted; the JSON round-trip stays lossless. The package remains
game-agnostic (imports no game types, never inspects `payload`, treats `type` as
an opaque non-empty string).

## 0.0.1

Initial workspace release: `{ seq, t, event }` entries with a numeric,
package-owned `schema_version: 1`.
