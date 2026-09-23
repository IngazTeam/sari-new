# Sary central landing — 23 September 2026

The approved human-centred design replaces the public central landing, inner product/solution/industry pages, guides, journal, help, company pages, account entry and subscription/payment screens. Merchant and administrator workspaces retain their existing application and access controls.

## Routes and languages

- 68 concrete central routes, plus existing parameterised recovery, subscription and payment routes.
- Arabic uses the clean path. English uses the same path with `?lang=en`.
- Both locales have reviewed content, translated interface states, native form labels, keyboard navigation and matching RTL/LTR layouts. Language switching retains relevant checkout and platform context.
- Production Express and integrated Vite development return complete HTML. Standalone Vite can also render the same shared markup in the client.
- Existing aliases still redirect where appropriate; newly independent product, sales, marketing, support and contact pages return their own content. Unknown routes retain real HTTP 404 responses.

## Search and sharing

Each public page includes a distinct title and description, a self-canonical URL, reciprocal Arabic/English/x-default alternatives, matching document language and direction, Open Graph/Twitter metadata and a local sharing image. Structured data describes the organisation, site, page, breadcrumbs, articles and visible FAQs where applicable. There are no fabricated review ratings, search actions or hardcoded commercial offers.

The sitemap contains 57 indexable pages in each language, for 114 URLs across the page and blog sitemaps. Account, recovery, invitation, subscription and payment screens have `noindex, nofollow`; tokens and tracking parameters are excluded from SEO metadata. Sensitive screens also use a no-referrer policy. No artificial daily last-modified dates are generated.

Guidance: [Google multilingual versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data). These improvements support crawling and understanding; search placement is not guaranteed.

## Application behaviour

- Login, signup, recovery, email verification and invitation acceptance use existing production API contracts and server validation. Login remembers the email only. Signup retains separate required terms/privacy consent and optional marketing consent.
- Published plan prices, currency and numeric limits come from the subscription API. Errors remain errors; unavailable data never produces an invented price.
- Checkout uses existing subscription/order payment endpoints and idempotency attempts. Confirmation requires captured/completed server status; a return URL or success query flag cannot declare payment successful.
- Contact/support submissions use the existing rate-limited public endpoint and show success only after server acceptance.
- The interactive conversation example is explicitly illustrative and creates no real orders.
- Arabic legal text retains the existing 2026-08-21 version; English translations accompany it. The policy itself was not replaced with mockup copy.

## Verification

- Production Vite/client and esbuild/server build, including the entry bundle budget.
- Bilingual render/SEO checks across all concrete routes, reciprocal alternates and complete sitemap coverage; live Express HTTP status checks.
- 213 tests passed across the 12 selected suites, including DOM interactions for signup consent, login errors, support acceptance, API pricing and verified payment status, alongside existing account, payment, public-claims and route regressions. The two new central suites are included in `test:release`.
- Browser review at desktop, 768px tablet and 390px mobile; navigation, language switching, form layouts and representative content types.
- The default TypeScript check reports an ES5/unicode-regex error in an unrelated, concurrently added `server/ai/sales-offer-evidence.ts`. A fresh `tsc --noEmit --target ES2022 --incremental false` passed. No repository compiler setting or unrelated AI file was changed.

The local UI preview at `http://127.0.0.1:4338/` serves the production build and SEO documents. It intentionally has no database/API connection; account submissions and prices require the actual application server. This work is a local integration and commit, not a production deployment.
