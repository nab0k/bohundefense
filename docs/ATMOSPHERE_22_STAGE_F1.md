# BOHUN Atmosphere 2.2 — Stage E/F1 handoff

**Status:** implemented on `feature/atmosphere-22-company-research`, not merged or deployed.

## Scope

This commit range adds a light Atlas visual skin to the **existing published frontend**. It neither rebuilds nor replaces the generated MapLibre GL bundle. `assets/atmo-atlas.js` moves the existing search element and the real bound category buttons; no duplicate data fetchers or filters are introduced. `assets/atmo-atlas.css` is activated by `body.atmosphere-22` only.

Screen-space dots are a mild temporary overlay. A native water-layer halftone has **not** been accepted or deployed.

## Preserved capabilities

- Actual MapLibre map and flat/globe projection controller.
- Existing source-wire and editorial feed behaviour.
- Existing company map markers and their selection handlers.
- Original company directory, company research page, public JSON and category handlers.
- Attribution, beta/coverage limitations and uncertainty about suppliers.

## Verified QA

Branch-only workflow: `.github/workflows/atmo-atlas-qa.yml` (read-only permissions, no deployment).
Tests: `scripts/atmo-browser-smoke.py`.

On desktop (1440×900), tablet (768×1024) and mobile (390×844):
- genuine `window.__map` and eight category controls loaded;
- existing category control state changed on click;
- flat and globe projection buttons changed the selected projection;
- Today loaded source headlines and its reader opened correctly;
- no captured JavaScript page errors;
- source-aware company profile loaded an existing company from public JSON, and did not assert unsupported relationships.

The workflow uploads screenshots as a temporary GitHub Actions artifact. The test is not a production release certification.

## Non-goals and known gaps

- No public content from private Notion is exported. No automatic public release pipeline.
- No A/B/C classifications, programme tiers, L0–L3 product edges, contracts or source-to-claim verification are invented.
- Mobile category scroll affordance and header typography still need visual review.
- Full browser navigation, keyboard/screen-reader audit, performance testing and tile-provider failure handling need extended QA.
- Halftone in the *real map style* needs cartographic validation; the present effect is screen-space.
- No production release or Cloudflare/GitHub Pages update has been authorised.

## Next controlled steps

1. Review actual desktop/mobile screenshots with owner, including open Today and company context.
2. Audit existing map style layers and test native water halftone under labels, disabled on unsupported globe modes.
3. Design canonical taxonomy mapping; legacy eight category shortcuts are not A/B/C codes.
4. Fix outstanding responsive and accessibility issues.
5. Integrate approved public-only data contract from Supabase/Notion after an independent QA/public-release decision.
6. Open a PR and deploy only after explicit review and separate approval.
