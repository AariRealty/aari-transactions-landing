# Aari Transactions · Pre-Launch Checklist

**Purpose:** Single source of truth for everything that has to be true before aaritransactions.com takes paid traffic. Every flag from the Phase 1-7 funnel-builder work consolidated here.

**Rule:** No item gets unchecked except by attorney sign-off or operational verification. No exceptions.

---

## 1. CRITICAL · attorney + compliance gates

These are blockers. Paid traffic cannot start until every box is checked.

- [ ] **Florida real estate attorney engaged** (recommended: hire Cristen Martinez-equivalent or actual Florida RE attorney)
- [ ] **Privacy Policy reviewed and ratified** by Florida attorney. File: `privacy.html`. Notice at bottom of file confirms attorney review is required.
- [ ] **Service Agreement v4.6 ratified** by Florida attorney
- [ ] **Service Agreement PDF renamed** from `aari-transactions-service-agreement-FOR-REVIEW.pdf` to clean filename (`aari-transactions-service-agreement-v4.6.pdf` or final version)
- [ ] **Service Agreement link updated** in intake modal step 4 to point to new filename
- [ ] **Terms of Service drafted, attorney-reviewed, and linked** in homepage footer Legal column
- [ ] **biBERK $1M E&O policy verified** — confirm carrier name is correct, confirm $1M limit is current, confirm coverage extends to TC team. Pull declarations page.
- [ ] **Operational claims verified:**
  - "Same business day TC assignment" — true on every file (across hero, trust strip, FAQ, final CTA)
  - "No close, no fee. No exceptions." — zero past files where Aari collected fee on dead deal
  - "Broker-reviewed before close" — every file goes through Marlenyi review (not sampled)
  - "Bilingual TC team (English & Spanish)" — every TC speaks both
  - TC team are licensed FL real estate agents (where claimed)

---

## 2. STRIPE · checkout alignment

Reference document: `stripe-checkout-copy.md` in this folder.

- [ ] **Producer Annual Stripe price verified.** Open `https://buy.stripe.com/9B64gr0JxgX14yfgfgcAo0b` in private browser. Confirm charge is $1,289. If different, align homepage card and FAQ to Stripe.
- [ ] **All 10 Stripe products updated** with Cattoni-voiced titles and descriptions per the reference doc
- [ ] **Statement descriptors set** on every product (under 22 characters)
- [ ] **Tax behavior confirmed** for each product (TC services typically non-taxable in FL)
- [ ] **Success URL set** on every product: `https://aaritransactions.com/thank-you.html?service=[product-name]`
- [ ] **Cancel URL set** on every product: `https://aaritransactions.com/index.html#pricing`
- [ ] **Service Agreement link added** to every Stripe description once public URL exists

---

## 3. TESTIMONIALS · Review System V1 launch path

- [ ] **Review System V1 backend live** (Netlify form receives submissions)
- [ ] **Per-TC review URLs tested:**
  - `aaritransactions.com/review.html` (generic)
  - `aaritransactions.com/review.html?tc=marlenyi`
  - `aaritransactions.com/review.html?tc=mile`
  - `aaritransactions.com/review.html?tc=eileen`
  - `aaritransactions.com/review.html?tc=silvia`
- [ ] **TC photos uploaded** to `images/` folder: `marlenyi-square.jpg`, `mile-square.jpg`, `eileen-square.jpg`, `silvia-square.jpg`
- [ ] **First 3 FTC-permissioned reviews collected.** Required for each: real agent first + last name, brokerage, market, headshot (optional), signed written permission record
- [ ] **Homepage testimonial placeholder swapped** with real reviews when first 3 are available. Section: `<section class="social-proof" id="testimonials">` in `index.html`

---

## 4. TECHNICAL · launch readiness

- [ ] **Google Maps API key generated and pasted** at `index.html` line 123 (`window.AARI_GOOGLE_MAPS_KEY`). Restricted to `aaritransactions.com` referrers.
- [ ] **Image width/height attributes added** to all `<img>` tags (kills CLS). Dimensions needed for:
  - `images/marlenyi-square.jpg`
  - TC headshots (`mile-square.jpg`, `eileen-square.jpg`, `silvia-square.jpg`)
  - `images/og-cover.jpg` (1200x630 already in meta tags)
- [ ] **Lighthouse mobile score >85** on Performance, Accessibility, Best Practices, SEO
- [ ] **`css/auth.css` conditional loading** — load only when login modal triggers (defer to dev)
- [ ] **WebP/AVIF alternatives** for headshots and OG cover (deferral acceptable; nice-to-have)
- [ ] **HTTPS enforced** site-wide
- [ ] **All forms submit successfully:**
  - Intake form (5-step)
  - Onboarding modal
  - Review form (per-TC)
  - Contact form
- [ ] **All Stripe links route correctly** (open each in private browser, confirm checkout loads, confirm price is right)

---

## 5. SCHEMA · SEO + structured data

- [ ] **Schema.org markup validates** via [Google Rich Results Test](https://search.google.com/test/rich-results)
- [ ] **FAQPage schema matches visible FAQ** (we aligned the TC timing answer this session; verify rest)
- [ ] **No stale Review schema** (we pulled the three unverified entries this session; verify clean)
- [ ] **ProfessionalService schema completeness** — name, URL, telephone, email, areaServed, makesOffer all accurate

---

## 6. COMPLIANCE · cross-surface consistency

- [ ] **Florida-only positioning** consistent across:
  - Homepage hero, FAQ, intake form (state lock)
  - About page
  - Privacy Policy
  - Stripe checkout descriptions
- [ ] **Broker license disclosure** present where required:
  - Homepage hero card
  - About page facts list
  - Service Agreement
- [ ] **No "kickbacks" or other RESPA-trigger words** anywhere in copy (fixed in Phase 7)
- [ ] **No emojis** anywhere on site (fixed in Phase 5)
- [ ] **No em-dashes** in any visible copy
- [ ] **AARI:TODO markers** all resolved before launch. Search HTML for `AARI:TODO`. As of end of Phase 7, these remain:
  - `index.html` Google Maps API key placeholder (line ~116-121)
  - Any other surface-level TODOs flagged inline

---

## 7. TRACKING · analytics + retargeting

- [ ] **Google Analytics 4 (or equivalent) installed** site-wide
- [ ] **Conversion events defined and firing:**
  - `intake_started` — when Submit a File modal opens
  - `intake_step_completed` — per step (1-5)
  - `intake_submitted` — final submission
  - `stripe_checkout_initiated` — when add-on or membership Pay button clicked
  - `stripe_checkout_completed` — when redirect from Stripe success URL hits
  - `review_submitted` — when review form completes
  - `cta_click` — when hero, sticky, or final CTA clicked
- [ ] **Retargeting pixels installed** (Meta, Google Ads, TikTok if running paid)
- [ ] **Email capture event** triggers nurture sequence
- [ ] **Custom audiences seeded** in ad platforms for retargeting

---

## 8. POST-LAUNCH · A/B test queue

Direction A (current hero) is the base. Variants ready to test once you have ≥1,000 paid sessions of baseline data.

- [ ] **Direction B test ready** — "Pay nothing until you close." H1 + "Built by a broker. Run for working agents." subhead
- [ ] **Direction C test ready** — "Your TC just paid for itself." H1 + "Florida TC for working agents." subhead
- [ ] **Test plan documented** — primary metric (intake_submitted), secondary metrics (CTA click rate, scroll depth), minimum sample size (≥500 sessions per variant), test duration (14 days minimum)
- [ ] **A/B testing infrastructure live** (PostHog, Optimizely, GrowthBook, or equivalent)

---

## 9. OPERATIONAL handoffs flagged during the funnel-builder work

These are reminders. Items here usually depend on something outside Claude's edit access.

- [ ] Privacy Policy attorney review (item 1 above)
- [ ] Terms of Service drafted (item 1)
- [ ] biBERK E&O verification (item 1)
- [ ] Producer Annual Stripe price (item 2)
- [ ] Stripe checkout copy applied (item 2)
- [ ] Real testimonials FTC-permissioned (item 3)
- [ ] Image width/height attributes (item 4)
- [ ] Service Agreement PDF rename (item 1)

---

## 10. LAUNCH GO/NO-GO

**Go criteria:** Every item in sections 1, 2, 3, 4, 5, 6 checked. Items in 7, 8 can ship post-launch.

**No-go criteria:** Any unchecked item in sections 1-6 OR any pending compliance flag from attorney review.

**On launch day:**
1. Final pass on Lighthouse mobile score
2. Submit `index.html` URL to Google Search Console
3. Submit sitemap.xml (if not already)
4. Soft-launch to 100 paid traffic visitors. Watch conversion funnel for 48 hours.
5. Scale up only after no critical issues in first 100.

---

*Last updated: 2026-05-11. Built from Phase 1-7 funnel-builder work. Update this document as items resolve.*
