/* ============================================================================
   Aari Transactions · Analytics event tracking module
   Phase 9 §1 · Conversion event spec ready to wire to GA4 / Meta / TikTok / etc.

   USAGE
   -----
   1. Wire your analytics provider's tracker to window.AariAnalytics.track().
      Default no-op fallback included. Examples:

      // Google Analytics 4 (gtag)
      window.AariAnalytics.track = function(eventName, params) {
        if (typeof gtag === 'function') gtag('event', eventName, params || {});
      };

      // Meta / Facebook Pixel
      window.AariAnalytics.track = function(eventName, params) {
        if (typeof fbq === 'function') fbq('trackCustom', eventName, params || {});
      };

      // Both providers at once
      window.AariAnalytics.track = function(eventName, params) {
        if (typeof gtag === 'function') gtag('event', eventName, params || {});
        if (typeof fbq === 'function') fbq('trackCustom', eventName, params || {});
      };

   2. Include this file in <head> or before closing </body> of every page
      that should track: <script src="js/aari-analytics.js" defer></script>

   3. The module auto-wires the standard events listed below. To track a
      custom one-off, call window.AariAnalytics.fire('event_name', { ... }).

   EVENTS TRACKED (from pre-launch-checklist.md §7)
   ------------------------------------------------
   intake_started               · Submit a File modal opens
   intake_step_completed        · per step transition (step 1 to 5)
   intake_submitted             · final submission of the intake form
   stripe_checkout_initiated    · any Stripe checkout button clicked (add-on or membership)
   stripe_checkout_completed    · landing on /thank-you.html with status=closing|paid
   review_submitted             · review form successful submission
   cta_click                    · hero, sticky, or final CTA clicked
   nav_link_click               · primary nav link clicked
   contact_form_submitted       · contact.html form submitted
   ============================================================================ */

(function() {
  'use strict';

  // Public namespace
  window.AariAnalytics = window.AariAnalytics || {};

  // ===========================================================================
  // AARI:WIRE · PLAUSIBLE ANALYTICS (recommended provider)
  // ---------------------------------------------------------------------------
  // To activate: sign up at plausible.io, add `aaritransactions.com`,
  // then UNCOMMENT the block below. No other changes needed.
  // Privacy-friendly, no cookie banner required, $9/mo for up to 10K pageviews.
  //
  // (function() {
  //   var s = document.createElement('script');
  //   s.defer = true;
  //   s.setAttribute('data-domain', 'aaritransactions.com');
  //   s.src = 'https://plausible.io/js/script.outbound-links.js';
  //   document.head.appendChild(s);
  //   window.plausible = window.plausible || function() {
  //     (window.plausible.q = window.plausible.q || []).push(arguments);
  //   };
  //   window.AariAnalytics.track = function(eventName, params) {
  //     if (typeof plausible === 'function') {
  //       plausible(eventName, { props: params || {} });
  //     }
  //   };
  // })();
  //
  // ---------------------------------------------------------------------------
  // ALTERNATIVE · GOOGLE ANALYTICS 4 (gtag)
  // ---------------------------------------------------------------------------
  // To activate GA4 instead: paste your GA4 measurement ID, then uncomment:
  //
  // (function() {
  //   var GA4_ID = 'G-XXXXXXXXXX'; // paste your GA4 measurement ID here
  //   var s = document.createElement('script');
  //   s.async = true;
  //   s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
  //   document.head.appendChild(s);
  //   window.dataLayer = window.dataLayer || [];
  //   window.gtag = function() { dataLayer.push(arguments); };
  //   gtag('js', new Date());
  //   gtag('config', GA4_ID);
  //   window.AariAnalytics.track = function(eventName, params) {
  //     if (typeof gtag === 'function') gtag('event', eventName, params || {});
  //   };
  // })();
  //
  // Pick ONE provider. Running both causes double-counting.
  // ===========================================================================

  // Default tracker is a no-op. Override this in your page head/body to wire
  // a real provider (gtag, fbq, etc.) per the USAGE notes above.
  if (typeof window.AariAnalytics.track !== 'function') {
    window.AariAnalytics.track = function(eventName, params) {
      // Replace this stub with your provider's tracker.
      // Leaving as console log so dev can verify the event fires.
      if (window.console && console.debug) {
        console.debug('[AariAnalytics no-op]', eventName, params || {});
      }
    };
  }

  // Public helper. Always available. Wraps track() with try/catch so a broken
  // tracker never breaks the funnel.
  window.AariAnalytics.fire = function(eventName, params) {
    try {
      window.AariAnalytics.track(eventName, params || {});
    } catch (e) {
      if (window.console && console.warn) {
        console.warn('[AariAnalytics] tracker error:', e);
      }
    }
  };

  // Convenience: the standard event names so callers can reference them
  // instead of typing strings everywhere.
  window.AariAnalytics.events = {
    INTAKE_STARTED: 'intake_started',
    INTAKE_STEP_COMPLETED: 'intake_step_completed',
    INTAKE_SUBMITTED: 'intake_submitted',
    STRIPE_CHECKOUT_INITIATED: 'stripe_checkout_initiated',
    STRIPE_CHECKOUT_COMPLETED: 'stripe_checkout_completed',
    REVIEW_SUBMITTED: 'review_submitted',
    CTA_CLICK: 'cta_click',
    NAV_LINK_CLICK: 'nav_link_click',
    CONTACT_FORM_SUBMITTED: 'contact_form_submitted'
  };

  // -----------------------------------------------------------------------
  // Auto-wire: standard events. Runs once DOM is interactive.
  // -----------------------------------------------------------------------
  function init() {
    var EV = window.AariAnalytics.events;

    // ---- intake_started · Submit a File modal opens ----
    document.querySelectorAll('[data-intake-trigger]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        var label = el.getAttribute('data-prefill-service') ||
                    el.textContent.trim().slice(0, 60);
        window.AariAnalytics.fire(EV.CTA_CLICK, {
          cta_label: label,
          cta_location: el.closest('section, header, footer, .sticky-cta, nav') ?
            (el.closest('section, header, footer, .sticky-cta, nav').className.split(' ')[0] || 'unknown') :
            'unknown'
        });
        window.AariAnalytics.fire(EV.INTAKE_STARTED, {
          source_label: label
        });
      }, { passive: true });
    });

    // ---- stripe_checkout_initiated · Stripe Pay button clicked ----
    document.querySelectorAll('a[href^="https://buy.stripe.com/"]').forEach(function(el) {
      el.addEventListener('click', function() {
        var name = el.getAttribute('data-prefill-service') ||
                   el.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
        var tier = el.getAttribute('data-tier-stripe') || '';
        window.AariAnalytics.fire(EV.STRIPE_CHECKOUT_INITIATED, {
          product: name,
          tier: tier,
          stripe_url: el.getAttribute('href')
        });
      }, { passive: true });
    });

    // ---- nav_link_click · primary nav links ----
    document.querySelectorAll('.nav-links a').forEach(function(el) {
      el.addEventListener('click', function() {
        window.AariAnalytics.fire(EV.NAV_LINK_CLICK, {
          link_text: el.textContent.trim(),
          link_href: el.getAttribute('href')
        });
      }, { passive: true });
    });

    // ---- contact_form_submitted ----
    var contactForm = document.querySelector('form[name="aari-contact"]');
    if (contactForm) {
      contactForm.addEventListener('submit', function() {
        var topicEl = contactForm.querySelector('[name="topic"]');
        window.AariAnalytics.fire(EV.CONTACT_FORM_SUBMITTED, {
          topic: topicEl ? topicEl.value : ''
        });
      }, { passive: true });
    }

    // ---- review_submitted ----
    var reviewForm = document.getElementById('reviewForm');
    if (reviewForm) {
      reviewForm.addEventListener('submit', function() {
        var ratingEl = reviewForm.querySelector('[name="rating"]:checked');
        var serviceEl = reviewForm.querySelector('[name="service"]');
        var tcSlugEl = reviewForm.querySelector('[name="tc_slug"]');
        window.AariAnalytics.fire(EV.REVIEW_SUBMITTED, {
          rating: ratingEl ? ratingEl.value : '',
          service: serviceEl ? serviceEl.value : '',
          tc_slug: tcSlugEl ? tcSlugEl.value : ''
        });
      }, { passive: true });
    }

    // ---- intake_submitted ----
    var intakeForm = document.getElementById('intake-form');
    if (intakeForm) {
      intakeForm.addEventListener('submit', function() {
        var svcName = (document.getElementById('intakeServiceName') || {}).value || '';
        var svcPrice = (document.getElementById('intakeServicePrice') || {}).value || '';
        var preferredTc = (document.getElementById('intakePreferredTc') || {}).value || '';
        window.AariAnalytics.fire(EV.INTAKE_SUBMITTED, {
          service_name: svcName,
          service_price: svcPrice,
          preferred_tc: preferredTc
        });
      }, { passive: true });
    }

    // ---- stripe_checkout_completed · thank-you.html landing with success status ----
    // Fires only on /thank-you.html. Reads ?status=closing | paid from URL.
    if (/thank-you\.html(?:$|[?#])/.test(window.location.pathname + window.location.search)) {
      var params = new URLSearchParams(window.location.search);
      var status = params.get('status') || '';
      var service = params.get('service') || '';
      if (status === 'closing' || status === 'paid') {
        window.AariAnalytics.fire(EV.STRIPE_CHECKOUT_COMPLETED, {
          status: status,
          service: service
        });
      }
    }

    // ---- intake_step_completed · listen for step transitions in intake modal ----
    // Hooks into the intake module's step label updates. Fires when the visible
    // step label changes.
    var stepLabel = document.getElementById('intakeStepLabel');
    if (stepLabel && 'MutationObserver' in window) {
      var lastStep = stepLabel.textContent;
      var observer = new MutationObserver(function() {
        var current = stepLabel.textContent;
        if (current && current !== lastStep) {
          var match = current.match(/(\d+)\D+(\d+)/);
          if (match) {
            window.AariAnalytics.fire(EV.INTAKE_STEP_COMPLETED, {
              step_index: parseInt(match[1], 10),
              total_steps: parseInt(match[2], 10)
            });
          }
          lastStep = current;
        }
      });
      observer.observe(stepLabel, { childList: true, characterData: true, subtree: true });
    }
  }

  // Wait for DOM to be interactive before wiring
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
