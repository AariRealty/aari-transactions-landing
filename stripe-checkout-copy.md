# Stripe Checkout Copy · Reference

Use this as the source of truth for every Stripe product page linked from aaritransactions.com. Every title and description below is Cattoni-voiced, compliance-aware, and matches the homepage catalog exactly.

**How to apply:**

1. Open [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Find each product by its current name or by the price
3. Update **Name** (shown at top of checkout) and **Description** (shown under title)
4. Save

**Brand rules baked in:**

- Period stops, no em-dashes
- No emojis
- Service tier separator is the middle dot (·) or "·" symbol
- Each description states Florida-only or "For Aari agents" where applicable
- Payment timing always explicit ("Pay at order" or "Billed at closing")
- Refund / cancellation reference points to Service Agreement

---

## Add-Ons (paid upfront)

### Offer Prep · Basic · $69

**Stripe link from site:** (whichever URL is wired in the homepage card)

**Recommended Name:**
```
Aari Transactions · Offer Prep · Basic
```

**Recommended Description:**
```
Buyer rep agreement. Offer drafting. Compensation rider. Compensation agreement. One draft. Revisions $25 after buyer signs. Agent provides all terms and approves in writing before sending to client. Florida only. Pay at order.
```

---

### Offer Prep · Complete · $149

**Recommended Name:**
```
Aari Transactions · Offer Prep · Complete
```

**Recommended Description:**
```
Offer and the back-and-forth until it's signed. Unlimited revisions before signing. Counter coordination (1 round). Execution verification both sides. Agent provides all terms and approves in writing. Florida only. Pay at order.
```

---

### Listing Docs Only · $99

**Recommended Name:**
```
Aari Transactions · Listing Docs
```

**Recommended Description:**
```
Complete listing package prep. Signed package review. Florida only. Pay at order.
```

---

### MLS Setup Only · $149

**Recommended Name:**
```
Aari Transactions · MLS Setup
```

**Recommended Description:**
```
MLS entry. Photo upload. Document upload. Showing instructions. ShowingTime configuration and syndication. Florida only. Pay at order.
```

---

### File Organization · $99

**Recommended Name:**
```
Aari Transactions · File Organization
```

**Recommended Description:**
```
Upload to your paperless system. Execution confirmed. Audit-readiness checked. Submitted for broker review and paid-at-closing through the DA. Broker-led. Florida only. Pay at order.
```

---

## Transaction Management (For Aari agents)

### Listing Coordinator · $199

**Recommended Name:**
```
Aari Transactions · Listing Coordinator
```

**Recommended Description:**
```
We run your listing end-to-end. Listing package, agreement, disclosures, brokerage docs. Reviewed for accuracy and compliance. HOA contact, docs, transfer. MLS input with photos. Status updates. Extensions and modifications. For Aari agents. Pay at order.
```

---

## Memberships

### Starter Membership · Monthly · $79 / mo

**Stripe URL:** `https://buy.stripe.com/cNi14f0JxdKPggX5ACcAo0c`

**Recommended Name:**
```
Aari Transactions · Starter Membership · Monthly
```

**Recommended Description:**
```
2 service credits per month. $30 off every TC file. Activity bonus: +2 extra credits when Aari runs 1 TC file that month. Credits apply to Offer Prep Basic, Listing Docs Only, MLS Setup Only, File Organization, Standalone Review. Unused credits do not roll over. Billed monthly. Cancel anytime.
```

---

### Starter Membership · Annual · $789 / yr

**Stripe URL:** `https://buy.stripe.com/7sY5kv4ZNcGLggX7IKcAo0d`

**Recommended Name:**
```
Aari Transactions · Starter Membership · Annual
```

**Recommended Description:**
```
All Starter benefits, billed annually. Save $159 versus monthly. Equivalent to $65.75 per month. 2 service credits per month. $30 off every TC file. Activity bonus: +2 extra credits when Aari runs 1 TC file that month. Credits apply to Offer Prep Basic, Listing Docs Only, MLS Setup Only, File Organization, Standalone Review. Unused credits do not roll over. Non-refundable. Cancel anytime stops auto-renewal; benefits continue through the paid 12-month term.
```

---

### Producer Membership · Monthly · $129 / mo

**Stripe URL:** `https://buy.stripe.com/eVq7sD4ZN7mrfcT7IKcAo0a`

**Recommended Name:**
```
Aari Transactions · Producer Membership · Monthly
```

**Recommended Description:**
```
4 service credits per month. $50 off every TC file. Activity bonus: +4 extra credits when Aari runs 2 TC files that month. Priority TC assignment. Credits apply to Offer Prep Basic, Listing Docs Only, MLS Setup Only, File Organization, Standalone Review. Unused credits do not roll over. Billed monthly. Cancel anytime.
```

---

### Producer Membership · Annual · $1,289 / yr

**Stripe URL:** `https://buy.stripe.com/9B64gr0JxgX14yfgfgcAo0b`

**Recommended Name:**
```
Aari Transactions · Producer Membership · Annual
```

**Recommended Description:**
```
All Producer benefits, billed annually. Save $259 versus monthly. Equivalent to $107.42 per month. 4 service credits per month. $50 off every TC file. Activity bonus: +4 extra credits when Aari runs 2 TC files that month. Priority TC assignment. Credits apply to Offer Prep Basic, Listing Docs Only, MLS Setup Only, File Organization, Standalone Review. Unused credits do not roll over. Non-refundable. Cancel anytime stops auto-renewal; benefits continue through the paid 12-month term.
```

---

## What to verify in Stripe before paid traffic

1. **Yearly prices match the site.** Starter annual = $789. Producer annual = $1,289. If Stripe shows different numbers, the site needs to align to Stripe (not the other way around).

2. **Statement descriptors.** Each product should have a statement descriptor (the text that appears on the customer's credit card statement) under 22 characters. Suggested:
   - TC services: `AARI TC`
   - Memberships: `AARI MEMBERSHIP`
   - Add-ons: `AARI ADDON`

3. **Tax behavior.** Confirm Florida sales tax is handled correctly for each product. TC services are typically non-taxable (professional services), but add-ons may vary.

4. **Refund policy linked in description.** The Service Agreement Section 2(a) governs refunds. Once the public Service Agreement URL is live, every Stripe description should link to it: `Refund and cancellation terms: [link to service agreement]`.

5. **Success and cancel URLs.** Each Stripe product should redirect to:
   - Success: `https://aaritransactions.com/thank-you.html?service=[product-name]`
   - Cancel: `https://aaritransactions.com/index.html#pricing`

---

## Operational handoffs flagged from this session

- [ ] Verify Producer Annual Stripe price = $1,289 (Starter confirmed at $789)
- [ ] Update all Stripe product names and descriptions per this reference
- [ ] Add statement descriptors under 22 chars to each product
- [ ] Confirm tax behavior per product
- [ ] Link Service Agreement URL in every description once public
- [ ] Verify success / cancel URLs per product

---

*Last updated: 2026-05-11. This reference matches the locked service catalog and homepage Cattoni-voice pass shipped in Phase 4.*
