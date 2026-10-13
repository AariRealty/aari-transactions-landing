/* Aari Transactions event hooks. No analytics provider is connected. */
(function() {
  'use strict';

  window.AariAnalytics = window.AariAnalytics || {};

  if (typeof window.AariAnalytics.track !== 'function') {
    window.AariAnalytics.track = function(eventName, params) {
      if (window.console && console.debug) {
        console.debug('[AariAnalytics no-op]', eventName, params || {});
      }
    };
  }

  window.AariAnalytics.fire = function(eventName, params) {
    try {
      window.AariAnalytics.track(eventName, params || {});
    } catch (e) {
      if (window.console && console.warn) {
        console.warn('[AariAnalytics] tracker error:', e);
      }
    }
  };

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

  function init() {
    var EV = window.AariAnalytics.events;

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

    document.querySelectorAll('.nav-links a').forEach(function(el) {
      el.addEventListener('click', function() {
        window.AariAnalytics.fire(EV.NAV_LINK_CLICK, {
          link_text: el.textContent.trim(),
          link_href: el.getAttribute('href')
        });
      }, { passive: true });
    });

    var contactForm = document.querySelector('form[name="aari-contact"]');
    if (contactForm) {
      contactForm.addEventListener('submit', function() {
        var topicEl = contactForm.querySelector('[name="topic"]');
        window.AariAnalytics.fire(EV.CONTACT_FORM_SUBMITTED, {
          topic: topicEl ? topicEl.value : ''
        });
      }, { passive: true });
    }

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
