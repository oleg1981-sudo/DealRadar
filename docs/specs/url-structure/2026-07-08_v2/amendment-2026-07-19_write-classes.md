# M2 Amendment — writer contract: liveness vs content-only write classes

**Date:** 2026-07-19 · **Approved by:** project owner (session decision, Q-9 of `docs/specs/pdp-full-content/2026-07-16_v1/spec.md`).
**Amends:** the writer contract of `spec.md` §5 (re-activation discriminator, lines ~105-124). This is an additive clarification recorded per the locked-spec process; it does not alter the discriminator itself.

## Context (why)

The locked re-activation rule flips any `expired` row back to `active` when `NEW.last_updated IS DISTINCT FROM OLD.last_updated`, on the premise that *only* writers confirming real availability/price bump `last_updated`. The PDP full-content spec (FR-1.2) introduces **daily content capture** (gallery, description_html, attributes, rating) for every fetched row, including hidden/expired ones. Under the original contract wording ("writers ALWAYS send a fresh last_updated"), those nightly content saves would masquerade as liveness evidence and structurally defeat the expiry model — every expired deal with a reachable merchant page would resurrect nightly.

## Amendment

Writers are split into two classes:

| Write class | Fields | `last_updated` |
|---|---|---|
| **Liveness-bearing** | `sale_price`, `original_price`, `discount_percent`, availability/visibility (`hidden`, and `status` transitions once M2 lands via the trigger) | **MUST send fresh `last_updated`** (unchanged from the original contract) |
| **Content-only** | `gallery`, `description`, `description_html`, `feed_attrs`, rating/provenance fields, `last_verified`, capture-outcome metadata | **MUST NOT send `last_updated`** |

A single PATCH containing both classes counts as liveness-bearing (it carries a price/availability confirmation) and bumps `last_updated`.

Unchanged and re-affirmed: no writer ever sends `status`, `expired_at`, or `content_changed_at`; the expiry cron and `update_historical_lows_batch` never touch `last_updated`.

Interpretation note: this *strengthens* the discriminator's semantics — `last_updated` now means "availability/price was confirmed", never "a picture was saved". The pre-existing behavior of `enrich-galleries.cjs` (gallery PATCH without `last_updated`) becomes contract-compliant by definition rather than an undocumented accident.

## Enforcement

EC-21 of the PDP full-content spec: static grep (no writer sends `status`/`expired_at`/`content_changed_at`) + runtime check that rows touched content-only by the latest verify run did **not** advance `last_updated`, while liveness-changed rows did.
