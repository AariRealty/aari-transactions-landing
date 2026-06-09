// Aari Transactions · Shared · Canonical Stripe payment links by service_type.
// Single source of truth — imported by payment-reminder (upfront pre-work flow)
// and closed-payment-reminder (TC services billed at closing).
export const STRIPE_LINKS: Record<string, string> = {
  listing_coordinator:         'https://buy.stripe.com/dRm3cn77V6in5Cj9QScAo0h',
  file_organization:           'https://buy.stripe.com/6oU00b2RF6infcT8MOcAo0f',
  starter_membership_monthly:  'https://buy.stripe.com/cNi14f0JxdKPggX5ACcAo0c',
  producer_membership_monthly: 'https://buy.stripe.com/eVq7sD4ZN7mrfcT7IKcAo0a',
  mls_setup:                   'https://buy.stripe.com/fZu5kvgIvbCH7Kr7IKcAo09',
  listing_docs:                'https://buy.stripe.com/6oU7sD8bZbCH3ubfbccAo08',
  offer_prep_basic:            'https://buy.stripe.com/3cI5kv63R227ggXbZ0cAo07',
  offer_prep_complete:         'https://buy.stripe.com/6oUfZ99g3gX18Ov4wycAo05',
  tc_one_side:                 'https://buy.stripe.com/8x23cn8bZ9uzc0H6EGcAo04',
  tc_both_sides:               'https://buy.stripe.com/cNi4grdwj9uz3ubfbccAo03',
};
