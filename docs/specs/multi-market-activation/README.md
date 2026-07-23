# Multi-Market Activation — handoff for review

**From:** Daniel · **For:** Oleg · **Date:** 2026-07-23
**The spec to review:** [`2026-07-23_v1/spec.md`](./2026-07-23_v1/spec.md)

Oleg — this is a design doc, not finished code. It's ready for you to review, push back on, revise however you see fit, and own from here. This README is the context so you don't have to reconstruct it from scratch. I'll try to be honest about what's solid, what's assumed, and what's genuinely undecided.

---

## How we got here (the backstory)

This didn't start as a multi-market project. It started with a complaint: newly-joined merchants' deal pages on dealradar.me looked thin — one image, a one-line description — nothing like the rich original product pages on the merchants' own sites (the Renogy MPPT charge controller was the example that kicked it off).

Chasing that down turned into a longer thread:

1. **Thin PDPs** → root cause was that the newer AWIN "Google-format" feeds ship almost no content (one image, short text), and the enrichment that was supposed to fix that (pulling the full gallery + description from the merchant's live page) either never ran or was structurally incapable of running. That got fixed — capture-at-verify, the price-drop promotion route, JSON-LD/agent-markdown emission, an acceptance harness that proves it stays fixed. (Merged: PRs #15, #18, #19, #20, #25.)

2. While auditing that, a bigger question surfaced: **we have 64 joined AWIN programmes but only 16 producing any deals on the site.** That 64-vs-16 gap is what led here.

3. Decomposing the gap (verified against the DB three ways) found the single biggest cause: **29 joined programmes are excluded by a German-only ingest policy** — and the frontend is *already* built for 16 markets (locales, country selector, per-currency formatting, countried product IDs). We're leaving most of a working multi-market frontend unused because the ingest only ever runs for Germany.

That's the problem this spec solves.

---

## Current state of the project (what's true today)

**Working and in production:**
- The German catalog: ~33.7k deals, 16 merchants, ingested nightly, verified against live shops, enriched, snapshotted, promoted, IndexNow-pinged. This pipeline is solid.
- A nightly coverage watchdog that classifies **every** joined programme with a reason and alerts on gaps (this is how we know the exact shape of the 64-vs-16 gap; it was also hardened during this work so a programme can never again silently fail to classify).
- The whole frontend rendering layer for 16 markets — country selector, 13 UI locales, per-country currency, IP/geo detection. It's built. It's just starving for data in 15 of the 16 markets.

**The honest gaps this spec is about:**
- Ingest is hardcoded to German-language + EUR (one config file + one default flag). Nothing else is DE-specific in the pipeline — the ingest script already takes `--country`/`--currency`/`--language` flags; the scheduled job just never uses them.
- Two concrete bugs that would silently undermine multi-market even after ingest is fixed: the **sitemap generator is hardcoded to `country: 'DE'`** (non-DE deals would be invisible to search engines), and **subcategory keyword-matching is German-only** (degrades gracefully, doesn't break).
- One genuinely unresolved architecture question: **country lives in a cookie, not the URL.** Fine for the interactive experience, but there's no crawlable/shareable URL for "the French homepage." Real multi-region ecommerce sites put the market in the URL. Changing that touches our locked URL/slug spec and the German catalog's live SEO — so I deliberately did **not** decide it. It's yours to call (spec §9 Q9).

---

## What the spec proposes (and what I deliberately left open)

**The shape:** key markets off AWIN's authoritative `country_code` (not the feed's self-reported language — I got that wrong in a first draft and corrected it, see the spec's §3 revision note), a per-market `feed-policy.json`, a GitHub Actions **matrix** so each market is one isolated job, per-market budgets/watchdog/alerting, and a **wave rollout** (EUR markets → non-EUR EU/EEA → US) so a currency bug can't hit 17 markets at once.

**Two things worth your specific attention:**

- **A same-market quick win, separable from everything else:** 6 of the "excluded" programmes are *already German merchants* — blocked only because their feed happens to be in English. That's a one-filter fix with zero new currency/legal risk. It can ship on its own, ahead of the rest. If you want a fast, safe first win, that's it.
- **US is different in kind, not degree.** Daniel asked to add the US as a market. I did — but as its own Wave 3, because it's not "just another non-EUR country": no VAT/Impressum (it's FTC affiliate-disclosure + state sales tax + CCPA-style privacy instead), the price display currently assumes EU tax-inclusive pricing (wrong for US), and the verifier's `.de`-domain price-detection heuristic has no US equivalent yet designed. The spec spells all of this out rather than hiding it in a config line.

**What I refused to decide for you (these are real forks, in spec §9):**
- What to do about the country-in-URL question (Q9) — I laid out a safe additive option and a fuller riskier one.
- The multi-market budget ceilings (Q3) — the current 5M-row / 350MB-egress limits were sized for one market.
- Ireland (Q2), dual-language markets like BE/CH (Q4), wave pacing (Q5), and the US-specific legal/pricing/verifier questions (Q6–Q8).

**The non-negotiable I built in, not around:** no market goes user-visible ahead of its legal clearance. There's a `legal_cleared` flag per market; engineering can build a market to fully-ready and it still won't show to users until that flag flips — which is a legal decision, not an engineering one. This respects the G2 gate in our own v3.1 ground truth. I want to be explicit: the spec makes the pipeline *ready* for all markets; it does **not** make them live. Going live is a legal act per jurisdiction, and that legal work is the real critical path.

---

## What I'd like from you

Review the spec, disagree with whatever you disagree with, and take it over. The open questions (§9) mostly need a product/business/legal call rather than more engineering analysis — those are yours (and Daniel's) to make, not mine to assume. Once the decisions are made, it's ready to turn into an implementation plan and build wave by wave.

If it's useful, the fastest low-risk starting point is the 6-programme German quick win + the sitemap `country:'DE'` fix — both are cheap, both are pure upside, and neither waits on any of the open decisions.

— Handed off via Claude Code on Daniel's behalf. Nothing here is implemented yet; it's all yours to revise.
