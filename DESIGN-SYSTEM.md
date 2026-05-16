# Aari Transactions · Design System
*Authoritative reference for portal + interior page consistency. Pulled from `index.html` as-shipped May 2026.*

---

## 1 · Color palette

### Primary
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#ffffff` | Page background, light section bg |
| `--ink` | `#0f0f0f` | Primary text, dark section bg, primary button fill |
| `--ink-pure` | `#0a0a0a` | Pure black for hero, pricing, founder sections (slightly darker than `--ink`) |
| `--surface` | `#ffffff` | Card fill on light sections |
| `--soft-bg` | `#fafaf8` | Hairline soft background fill for inset cards |
| `--ink-2` | `#262626` | Secondary dark text (lede, body emphasis) |
| `--muted` | `#6b6b6b` | Body muted text on light bg |
| `--muted-2` | `#9a9a9a` | Tertiary muted (timestamps, captions) |

### Lines
| Token | Hex | Use |
|---|---|---|
| `--line` | `#e8e8e6` | Default hairline, card borders, section dividers |
| `--line-2` | `#d4d4d2` | Emphasized hairline |

### Brand accents (cream + bronze + sage)
| Token | Hex | Use |
|---|---|---|
| `--pastel-cream` | `#f0e9da` | Soft cream wash (legacy variable) |
| **Brand cream** | `#f5f0e8` | Used heavily — section "spread" blocks, dossier cards, brand-pill highlight, footnotes, accent fills on dark sections |
| **Brand bronze** | `#967a4a` | Editorial eyebrow color on dark sections, accent borders on quotes, vertical accent strips on featured items |
| **Cream warm-darker** | `#e8e0d2` | Secondary cream tier (folder-tab alt, layered cards) |
| **Cream text-on-cream** | `#5a4e3a` / `#8a7f6a` | Warm dark text used inside cream cards |
| `--pastel-sage` | `#a4b8a6` | ✓ indicator accent, "good column" badge in comparison cards |
| `--pastel-sage-soft` | `#eef2ec` | Sage wash background |

### State / signal
| Token | Hex | Use |
|---|---|---|
| `--accent-dark` | `#000000` | Maximum-contrast text/border edge |
| Bad column muted | `#bdb8a8` on `#1a1a1a` | Comparison "Most TCs" column text (AA-passing) |
| Hero check inline color | `inherit` (white on dark) | Trust signal checks |

### Shadows
| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(23,21,19,0.04), 0 1px 3px rgba(23,21,19,0.06)` | Subtle elevation (button rest) |
| `--shadow-md` | `0 4px 6px rgba(23,21,19,0.04), 0 10px 15px rgba(23,21,19,0.08)` | Card elevation |
| `--shadow-lg` | `0 20px 25px rgba(23,21,19,0.08), 0 8px 10px rgba(23,21,19,0.04)` | Hero card, modal |
| Dossier shadow on dark bg | `0 18px 40px rgba(0,0,0,0.45)` | Cream card on dark section |

---

## 2 · Typography

### Font families
```css
--serif: 'Cormorant Garamond', Georgia, serif;
--sans:  'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```
**Plus** `Montserrat` (weights 400/500/600/700) loaded for utility blocks (sticky CTA, FAQ accordion, intake modal).

**Google Fonts link:**
```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Type scale

| Class / context | Font | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|---|
| Hero H1 | serif | `clamp(38px, 5.5vw, 68px)` | 600 | 1.05 | -0.02em |
| Section H2 (sans) | sans | `clamp(28px, 3.5vw, 44px)` | 700 | 1.15 | -0.02em |
| Section H2 (serif, editorial) | serif | `clamp(28px, 3.8vw, 42px)` | 500 | 1.05 | -0.6px |
| Founder quote (Vogue minimalist) | serif italic | `clamp(22px, 3vw, 32px)` | 400 | 1.32 | -0.3px |
| Card name / H3 | sans | 16–22px | 500–700 | 1.1–1.2 | -0.2px |
| Body / lede | sans | 18px | 400 | 1.6 | normal |
| Body default | sans | 15px | 400 | 1.55 | normal |
| Small text / metadata | sans | 11–13.5px | 500–600 | 1.4–1.6 | varies |
| Eyebrow | sans | 10–11px | 600–700 | 1 | 2.2–3px uppercase |
| Brand wordmark | serif | 24px | 600 | 1 | 4px (caps) |
| Big price number | sans | 38–52px | 700 | 1 | -1.2 to -1.6px |

### Italic-Roman pattern (brand signature)
Every section H2 splits italic + roman. Italic emphasis lands on the verb or the "why" half of the sentence:

```html
<h2>Run like <em>one.</em></h2>
<h2>Flat prices.<br><em>Pay at closing or upfront.</em></h2>
<h2>Run more files. <em>Pay less per file.</em></h2>
<h2>Why agents <em>switch</em> to Aari.</h2>
<h2>What every Aari file <em>runs on.</em></h2>
<h2>Questions agents ask before <em>their first file.</em></h2>
```
Italic em tag inherits the serif font but gets `font-style: italic`. Color often cream/bronze on dark sections, brand-bronze on light sections.

### Case rules
- **Sentence case** throughout. No Title Case. No ALL CAPS except for eyebrows and tiny labels (where letter-spacing creates the caps look).
- Eyebrows use `text-transform: uppercase` + heavy letter-spacing.

---

## 3 · Spacing & Layout

### Container widths
| Class | Max-width | Padding |
|---|---|---|
| `.wrap` | 1180px | `0 24px` |
| `.narrow` | 920px | `0 24px` |
| Pricing wrap (inner content) | 860px | inherited |
| Pricing ala-grid | 1080px | inherited |
| Dossier / founder grid | 980px | inherited |
| FAQ wrap | 680px | inherited |

### Section padding (vertical)
- Standard light section: `padding: 64px 24px` to `72px 24px`
- Dark hero-like section: `padding: 80px 24px 68px`
- Cream spread block: `padding: 48px 36px 44px`
- Compact (banner / urgency strip): `padding: 14px 0`

### Corner radius scale
| Token | Value | Use |
|---|---|---|
| `--r-sm` | 10px | Buttons, small chips |
| 4–6px | — | Card inner elements (photos, dividers) |
| 8px | — | Cards, brand pills (rounded but not pill) |
| 10–12px | — | Major cards (pricing, dossier, sections) |
| `--r-md` | 16px | (legacy) |
| `--r-lg` | 22px | (legacy) |
| 999px | — | Pills (brand pills, "Most popular," meta tags) |

---

## 4 · Components

### Buttons

```html
<a class="btn primary" href="…">Submit a file <span class="arr">→</span></a>
<a class="btn secondary" href="…">See pricing →</a>
<a class="btn ghost" href="…">Read more</a>
<a class="btn primary pulse" href="…">Submit a File →</a>  <!-- animated -->
```

- **Primary:** black fill, white text, hover inverts to white fill + black text + lift
- **Secondary:** transparent fill, black border + text, hover inverts to black fill + white text
- **Ghost:** no background, no border, dim on hover
- Padding: `14px 26px` default, `17px 32px` (`.btn.lg`), `10px 18px` (`.btn.sm`)
- Border radius: 10px (`--r-sm`)
- Font: sans, 14px, weight 600
- Pulse animation: 2.4s loop + bounce 5s loop. Disabled with `prefers-reduced-motion`.

### Pricing tier card

```html
<article class="pricev2-card light">
  <div class="pricev2-inscription">
    <span class="pricev2-inscription-line"></span>
    <span class="pricev2-inscription-text"><em>the pick</em></span>
    <span class="pricev2-inscription-line"></span>
  </div>
  <h3 class="pricev2-card-name">One Side</h3>
  <p class="pricev2-card-tag">Buyer or Seller representation</p>
  <div class="pricev2-card-bignum">$399</div>
  <span class="pricev2-card-bigsub">One Side · per file</span>
  …
  <a class="pricev2-card-cta">My pick</a>
</article>
```

- **Featured (`.light`):** white card with the `"the pick"` italic-serif inscription at top
- **Alternative (`.dark`):** pure black `#000` card with thin white border at 12% opacity
- Border radius: 10px
- Padding: `28px 24px 24px`
- Big number: 52px sans bold, letter-spacing -1.6px
- Margin-top: 14px (creates room for inscription)

### Brand pill (small horizontal tag)
```html
<li class="fcvA-brand-pill"><em>01</em>Aari Realty</li>
<li class="fcvA-brand-pill is-current"><em>03</em>Aari Transactions</li>
```
- Standard: cream border at 18% opacity, transparent fill
- Current: cream `#f5f0e8` fill, dark text
- Italic-serif number prefix
- Padding: `8px 16px`, radius 999px (full pill)

### Editorial eyebrow + headline pattern
```html
<header>
  <span class="eyebrow">Built by a broker</span>
  <h2>Run like <em>one.</em></h2>
</header>
```
- Eyebrow: 10–11px sans, weight 600, uppercase, letter-spacing 2.5–3px, bronze `#967a4a` on dark or muted `#888` on light
- Always centered, ~14px below the eyebrow

### Section divider curves
Four SVG curve shapes between sections — `div-scallop`, `div-arch`, `div-slash`, `div-hill`. Each is a `<div class="div-shape div-X">` with inline SVG. The `fill` color of the path = the color of the SECTION ENTERED. The container's `background` = the color of the section EXITED.

```html
<div class="div-shape div-hill" style="background:#f5f0e8" aria-hidden="true">
  <svg viewBox="0 0 1200 46" preserveAspectRatio="none">
    <path d="M0,46 L0,30 C300,5 900,5 1200,30 L1200,46 Z" fill="#fff"/>
  </svg>
</div>
```

---

## 5 · Section patterns

### Light section (default)
- `background: #fff`, `color: #0f0f0f`
- Border-bottom: `1px solid var(--line)`
- Padding: `64px 24px`
- Centered header (eyebrow + h2 + lede), then content grid

### Dark section
- `background: #0a0a0a` or `#0f0f0f`, `color: #fff`
- Padding: `72px 32px`
- Eyebrow color: bronze `#967a4a`
- Often has the hero-style atmospheric dot field overlay (`.mr-hero-dots`)

### Cream section / spread
- `background: #f5f0e8`, `color: #0f0f0f`
- Used as a "magazine spread" break inside a darker section
- Border-radius: 14px (when inset) or 0 (when full-bleed)

### Section alternation rule
**No two adjacent sections share a background color.** The page rhythms black → white → cream → repeat. Always check this when adding or reordering sections.

---

## 6 · Sticky desktop nav

```html
<nav class="nav" aria-label="Primary">
  <div class="wrap">
    <a href="#main-content" class="brand">
      <span class="mark-wordmark">AARI</span>
      <span class="name">Aari Transactions<small>Florida TC</small></span>
    </a>
    <div class="nav-links">
      <a href="#pricing">Pricing</a>
      <a href="#how">How it works</a>
      <a href="#faq">FAQ</a>
      <a href="/portal" class="nav-portal">Portal</a>
      <a href="#apply" class="nav-cta" data-intake-trigger>Submit a file →</a>
    </div>
  </div>
</nav>
```
- Background: `rgba(251,249,244,0.92)` with `backdrop-filter: blur(10px)`
- Border-bottom: `1px solid var(--line)`
- Padding: `14px 0`, height ~72px
- Sticky at top, z-index 90
- **Hidden under 900px** (`display: none` on mobile — mobile uses the sticky bottom CTA bar instead)
- `html { scroll-padding-top: 72px }` to keep anchor jumps offset cleanly

**Three CTA styling tiers in the nav:**
1. Text link (Pricing / How it works / FAQ) — plain hover bg
2. Outlined (Portal) — hairline border, transparent fill, sign-in feel
3. Solid (Submit a file →) — primary black filled CTA

---

## 7 · Imagery

- **Photo treatments:** subtle inset hairline ring (1px rgba 6%) inside photo containers for polish
- **Photo gradient placeholder** (when no image yet): `linear-gradient(135deg, #d8cdb6 0%, #b8a989 100%)` for cream-toned founder portraits; `linear-gradient(135deg, #2a2a2a, #141414)` for dark mode portraits
- **Aspect ratios:** square (`1/1`) for headshots in lists/grids, portrait (`4/5`) for editorial portraits, hero (`3/2`) for landscape

---

## 8 · Footer pattern

- Background: `#0a0a0a`
- White text
- Sections: brand identity left, navigation columns center, social/legal right
- Wordmark uses white border instead of dark (`footer .brand .mark-wordmark { color: #fff; border-color: #fff }`)
- Disclosure line at the very bottom: `Marlenyi Paredes · Licensed FL Real Estate Broker · BK3530153 · Aari Realty`

---

## 9 · Compliance attribution baseline

Every page must include the brokerage attribution conspicuously:
> *Aari Transactions LLC · operated under Aari Realty · FL Broker BK3530153*

Already present in:
1. Pricing-section footnote (above the fold of conversion)
2. Footer disclosure
3. Team section ("Reviewed by Marlenyi Paredes · FL Broker")

Interior pages should mirror this attribution somewhere visible.

---

## 10 · Brand voice

| Do | Don't |
|---|---|
| Direct, broker-grade, no fluff | Hype, superlatives ("the best", "fastest") |
| Sentence case headings | Title Case or ALL CAPS body copy |
| Italic-roman serif H2 split (`Run like <em>one.</em>`) | Mixing display fonts in the same heading |
| Numbers as italic serif (`<em>01</em>`) | Bold sans numbers as decoration |
| "Same-day pickup," "broker-reviewed," "no close, no fee" — specific claims | Vague soft promises ("we care," "we'll handle it") |
| One CTA per conversion moment | Two CTAs back-to-back |
| FREC/DBPR/RESPA-specific copy | Generic compliance hand-waving |

### Absolute claims to avoid
Anything falsifiable: *"zero this year," "every single time," "always," "never," "guaranteed."* Soften to *"the exception, not the rule," "designed to," "built for."*

---

## 11 · Accessibility baseline

- **One H1 per page.** Modals use H2 as their top heading.
- **Alt text describes role**, not just name. ("Eileen Hernandez, Aari TC" — not "Eileen.")
- **No font size below 11px.**
- **Color contrast:** WCAG AA minimum (4.5:1 for body text, 3:1 for large text).
- **Skip-link** at top of body: `<a href="#main-content" class="skip-link">Skip to main content</a>`. Page wraps content in `<main id="main-content">`.
- **Icon-only buttons** get `aria-label`. Decorative SVGs get `aria-hidden="true"`.
- **Section landmarks:** `<header>`, `<nav>`, `<main>`, `<footer>` all present and used semantically.

---

## 12 · Section alternation cheatsheet

Current homepage flow (use this rhythm on interior pages):
```
banner (urgency strip)
nav (sticky)
hero (white + dot field)
…alternating black / white / cream sections…
pricing (black + dot field, cream disclaimer footnote)
final CTA (cream)
FAQ (white)
footer (black)
```

Never place two consecutive sections of the same background color without a divider curve breaking them up.

---

*Last updated: May 2026. Source of truth: `index.html`. When in doubt, grep the source.*
