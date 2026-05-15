# Aari Logo Upload Instructions
*Reference doc for swapping or updating Aari brand assets without engineering*

---

## Current state · what's on the site today

| Asset | Current implementation | Location |
|---|---|---|
| Header wordmark | Text-rendered "AARI" in serif with black border | `index.html` line ~221, class `.mark-wordmark` |
| Footer wordmark | Removed (per Phase 4 cleanup) | — |
| Favicon | Inline SVG · single "A" in a black square | `index.html` line ~38 |
| OG image (social shares) | `/images/og-cover.jpg` (1200×630) | Referenced in `<meta property="og:image">` |
| Apple touch icon | Not currently set | — |

You don't need to upload an "Aari logo" file today — the page renders the wordmark as styled text. The instructions below are for when you commission a real logo and want to swap it in.

---

## File specifications · when you commission a real logo

### Master logo asset
| Spec | Value |
|---|---|
| Format | SVG (vector master) + PNG (raster fallback at 2x) |
| Color versions needed | Black-on-transparent, white-on-transparent |
| Aspect ratio | Horizontal (~3:1) for header, square (1:1) for favicon |
| Padding | 10% safe area on all sides inside the artboard |

### Header logo
| Spec | Value |
|---|---|
| Format | SVG preferred · PNG fallback |
| Display size | ~40px tall × ~120px wide |
| Color | Black version (header is on white background) |
| File name | `aari-logo.svg` and `aari-logo.png` |

### Footer logo (if you bring it back)
| Spec | Value |
|---|---|
| Format | Same as header but white version |
| Color | White (footer is on black background) |
| File name | `aari-logo-white.svg` |

### OG image (social sharing card)
| Spec | Value |
|---|---|
| Format | JPG (better compression than PNG for photos) |
| Dimensions | 1200×630 (Facebook · LinkedIn · Twitter spec) |
| Content | Aari wordmark + tagline + brand visual |
| File name | `og-cover.jpg` |

### Favicon
| Spec | Value |
|---|---|
| Format | PNG (multiple sizes) + .ico for IE fallback |
| Sizes | 16×16, 32×32, 192×192, 512×512 |
| File names | `favicon.ico`, `favicon-32x32.png`, `favicon-192x192.png`, `favicon-512x512.png` |
| Color | Solid square (black bg with white "A" works, or full Aari mark) |

### Apple touch icon (iOS home screen)
| Spec | Value |
|---|---|
| Format | PNG |
| Dimensions | 180×180 |
| File name | `apple-touch-icon.png` |
| Color | Solid square (no transparency, iOS rounds corners) |

---

## File naming convention

Always lowercase, hyphenated, descriptive:

```
aari-logo.svg              ← master vector
aari-logo.png              ← raster (2x)
aari-logo-white.svg        ← light version for dark backgrounds
aari-logo-mark.svg         ← just the "A" mark, no wordmark
favicon.ico
favicon-32x32.png
favicon-192x192.png
apple-touch-icon.png
og-cover.jpg
```

---

## Where to put files

All logo files live in `/images/` folder inside the Website directory:

```
Website/
└── images/
    ├── aari-logo.svg
    ├── aari-logo-white.svg
    ├── favicon.ico
    ├── favicon-32x32.png
    ├── favicon-192x192.png
    ├── apple-touch-icon.png
    └── og-cover.jpg
```

---

## Step-by-step · replacing the header logo with an image

1. Save your logo file as `aari-logo.svg` in `Website/images/`
2. Open `Website/index.html` in a text editor
3. Find this code (around line 221 area in the styles, and where `mark-wordmark` is used in markup):
   ```html
   <span class="mark-wordmark" aria-label="Aari">AARI</span>
   ```
4. Replace it with:
   ```html
   <img src="images/aari-logo.svg" alt="Aari" class="brand-logo" style="height:40px;width:auto;display:block">
   ```
5. Save the file
6. Commit + push to GitHub (Netlify will deploy automatically)
7. Hard-refresh the live site (Cmd+Shift+R on Mac) to clear cache

---

## Step-by-step · replacing the OG social share image

1. Save your new social card as `og-cover.jpg` in `Website/images/` (must be exactly 1200×630)
2. Same filename = no code change needed
3. Push to GitHub · Netlify deploys
4. **Verify the swap took effect** at:
   - LinkedIn: https://www.linkedin.com/post-inspector/
   - Facebook: https://developers.facebook.com/tools/debug/
   - Twitter: https://cards-dev.twitter.com/validator
   - Each tool has a "Re-scrape" or "Refresh" button — click it once after deploy

---

## Step-by-step · replacing the favicon

1. Generate your favicon set at https://realfavicongenerator.net/ (free)
2. Download the zip · extract all the PNG and .ico files
3. Drop them into `Website/images/`
4. Open `index.html` and replace the inline SVG favicon (around line 38) with:
   ```html
   <link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32x32.png">
   <link rel="icon" type="image/png" sizes="192x192" href="/images/favicon-192x192.png">
   <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png">
   <link rel="shortcut icon" href="/images/favicon.ico">
   ```
5. Push · deploy · hard-refresh

---

## Verification checklist · after any swap

- [ ] Hard-refresh the live URL (Cmd+Shift+R)
- [ ] Open the page in an incognito/private window (bypasses cache)
- [ ] Test mobile by checking the page on your phone
- [ ] Check social share preview in LinkedIn/Facebook debugger
- [ ] Verify favicon shows in the browser tab
- [ ] Check that footer wordmark (if reintroduced) renders correctly

---

## Color rules · what stays consistent

- Header logo: always BLACK (header background is white)
- Footer logo: always WHITE (footer background is black, per Option L)
- Favicon: solid square (no transparency · iOS / browser tabs need defined edge)
- OG image: full color with photography or brand visual · 1200×630 exact

---

## What NOT to do

- Don't use transparent PNG for the favicon · iOS adds black bars
- Don't upload logos as JPGs · use PNG or SVG for transparency support
- Don't upload images larger than 500KB · compress first at https://tinypng.com
- Don't change file names without updating the HTML reference
- Don't skip the cache-clearing step · most "logo didn't update" issues are cache, not code

---

*Last updated: May 2026 · Aari Transactions Website*
