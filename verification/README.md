# Phase 3B.3 statement verification

The production build was tested against the existing persisted records on 2026-10-14 using system Google Chrome with browser sandboxing enabled. All 36 checks passed. No records were seeded or changed; the database SHA-256 matched before and after verification.

The purchase is WAL-MV8GM2EH-E5TU / order LL-MV8GM2EG-RB3T (The Clubhouse, 350000 kobo / ₦3,500). The excluded deposit is DEP-MV8GM1XR-5511 (20000000 kobo / ₦200,000).

Repairs:

- The page consumes the existing API `rows` contract using the shared `StatementResponse` and `StatementRow` types in `lib/statement.ts`; explicit `any` was removed.
- Fetching uses `useCallback`, an effect with its dependency, AbortController cleanup, and a request-version guard. Old success/error/finally callbacks cannot overwrite newer results.
- Successfully fetched data and its query are committed together. Download buttons use that query, and the displayed period uses the response dates. Unsaved or failed filter changes retain the previous successful query.
- Fetch and download failures produce visible alerts, including network failures and non-JSON HTTP errors. Downloads are unavailable until a statement has loaded successfully.
- PDFs embed the used glyph subset of the openly licensed Noto Sans asset, including U+20A6. The license and attribution are in `assets/fonts/`. No proprietary/system font was copied. The production trace includes the font asset.
- API date validation now rejects invalid calendar dates, timestamps instead of dates, and reversed periods. Supported payment filtering and posted-purchase/settled-order eligibility are preserved.
- Statement lint defects were fixed without rule suppression.

Verification covers all outlets, Clubhouse, Revivo, an inclusive same-day range, dates before/after the purchase, and wallet payment. For each case, API totals and actual UI CSV/PDF downloads match the displayed total. CSV retains its existing integer-kobo amounts. Additional checks cover unsaved inputs, failed applies, JSON/plain-text/network failures for fetch and both downloads, initial-load failure, reset, recovery, and stale successful/error responses. The race test deliberately ignores cancellation and releases an older response after a newer filter result is displayed.

Evidence is in `artifacts/results.json`, `artifacts/statement-ui.png`, `artifacts/statement-error.png`, `artifacts/pdf-preview.png`, `artifacts/pdf-fonts.txt`, and the saved CSV/PDF files. The page screenshot and rasterized PDF were also visually inspected; the PDF visibly displays ₦3,500 on the purchase and total lines.

To rerun from this project directory, start the production server in one terminal:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3103
```

Then run in a second terminal:

```sh
STATEMENT_CHROMIUM_PATH=/usr/bin/google-chrome node verification/statements.mjs
npx tsc --noEmit
npm run lint
npm run build
```

The browser path can be changed to a compatible local Chromium installation. Omitting it uses Playwright's installed browser. The script always enables browser sandboxing. It requires the local Poppler `pdftotext`, `pdffonts`, and `pdftoppm` tools for PDF verification. The existing persisted fixture records must be present.

TypeScript and lint passed. Lint has no errors and no statement warnings; five pre-existing `next/no-img-element` warnings remain in dining pages. No lint rules were disabled.

The final `npm run build` also passed after all 36 verification checks completed.
