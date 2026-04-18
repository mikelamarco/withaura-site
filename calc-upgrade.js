/**
 * calc-upgrade.js — Aura AI Calculator Post-Submit Experience
 *
 * Drop-in enhancement for withaura.io. Add one line before </body>:
 *   <script src="calc-upgrade.js"></script>
 *
 * What it does:
 *  1. Captures UTM attribution params and injects hidden fields into the form
 *  2. Intercepts form submit, posts to Netlify Forms via fetch (keeps lead capture)
 *  3. Transforms the calculator section into a post-submit booking experience:
 *     - Revenue summary with the user's actual calculated loss
 *     - "What happens on the call" panel (left)
 *     - Calendly inline embed pre-filled with name + email (right)
 *  4. Routes high-value leads (monthly loss >= $5,000) to a priority path
 *
 * To set up a separate priority Calendly link, replace PRIORITY_CALENDLY_URL below.
 */

(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  var STANDARD_CALENDLY_URL  = 'https://calendly.com/contact-belmarconsulting';
  var PRIORITY_CALENDLY_URL  = 'https://calendly.com/contact-belmarconsulting'; // swap when priority event is created
  var HIGH_VALUE_THRESHOLD   = 5000; // monthly loss in USD

  // ─── Attribution capture ─────────────────────────────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var attribution = {
    utm_source:   params.get('utm_source')   || 'direct',
    utm_medium:   params.get('utm_medium')   || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_content:  params.get('utm_content')  || '',
    utm_term:     params.get('utm_term')     || '',
    referrer:     document.referrer          || 'none',
    landing_page: window.location.pathname
  };

  // ─── Inject styles ───────────────────────────────────────────────────────────
  function injectStyles() {
    var css = `
      /* ── Post-submit wrapper ── */
      .calc-booked-wrapper {
        padding: 0;
        animation: cbFadeIn 0.4s ease;
      }
      @keyframes cbFadeIn {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── Revenue summary bar ── */
      .cb-summary {
        text-align: center;
        padding: 48px 24px 40px;
        background: var(--color-bg, #f5f0e8);
      }
      .cb-loss-badge {
        display: inline-block;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 6px 16px;
        border-radius: 20px;
        background: #2c1810;
        color: #f5f0e8;
        margin-bottom: 20px;
      }
      .cb-loss-badge.cb-priority {
        background: #8b1a1a;
        color: #fff;
      }
      .cb-headline {
        font-family: var(--font-serif, Georgia, serif);
        font-size: clamp(24px, 4vw, 40px);
        font-weight: 400;
        line-height: 1.2;
        color: #1a1a1a;
        margin: 0 auto 12px;
        max-width: 700px;
      }
      .cb-loss-amount {
        color: #b8a27a;
        font-style: italic;
      }
      .cb-subline {
        font-size: 16px;
        color: #555;
        max-width: 540px;
        margin: 0 auto;
        line-height: 1.6;
      }

      /* ── Two-column layout ── */
      .cb-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        min-height: 700px;
        background: #fff;
      }
      @media (max-width: 768px) {
        .cb-columns {
          grid-template-columns: 1fr;
        }
      }

      /* ── What happens panel ── */
      .cb-what-happens {
        padding: 48px 40px;
        background: #f9f7f3;
        border-right: 1px solid #e8e0d0;
      }
      .cb-what-happens h3 {
        font-family: var(--font-serif, Georgia, serif);
        font-size: 22px;
        font-weight: 400;
        color: #1a1a1a;
        margin: 0 0 28px;
      }
      .cb-steps {
        list-style: none;
        padding: 0;
        margin: 0 0 32px;
      }
      .cb-steps li {
        display: flex;
        gap: 16px;
        margin-bottom: 28px;
        align-items: flex-start;
      }
      .cb-step-num {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #2c1810;
        color: #f5f0e8;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 2px;
      }
      .cb-steps strong {
        display: block;
        font-size: 15px;
        font-weight: 600;
        color: #1a1a1a;
        margin-bottom: 4px;
      }
      .cb-steps p {
        font-size: 14px;
        color: #666;
        line-height: 1.6;
        margin: 0;
      }
      .cb-details {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        padding-top: 24px;
        border-top: 1px solid #e8e0d0;
      }
      .cb-details span {
        font-size: 13px;
        color: #555;
        font-weight: 500;
      }
      .cb-priority-note {
        margin-top: 20px;
        padding: 14px 18px;
        background: #fff4f4;
        border-left: 3px solid #8b1a1a;
        border-radius: 4px;
        font-size: 13px;
        color: #5a1a1a;
        line-height: 1.5;
      }

      /* ── Calendly column ── */
      .cb-calendly-col {
        padding: 48px 40px 24px;
        background: #fff;
      }
      .cb-calendly-col h3 {
        font-family: var(--font-serif, Georgia, serif);
        font-size: 22px;
        font-weight: 400;
        color: #1a1a1a;
        margin: 0 0 20px;
      }
      .cb-calendly-embed {
        min-width: 280px;
        height: 620px;
      }
      @media (max-width: 768px) {
        .cb-what-happens,
        .cb-calendly-col {
          padding: 32px 20px;
        }
        .cb-calendly-embed {
          height: 580px;
        }
      }
    `;
    var style = document.createElement('style');
    style.id = 'calc-upgrade-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Add hidden attribution fields to form ───────────────────────────────────
  function addAttributionFields(form) {
    Object.keys(attribution).forEach(function (key) {
      var input = document.createElement('input');
      input.type  = 'hidden';
      input.name  = key;
      input.value = attribution[key];
      form.appendChild(input);
    });
  }

  // ─── Submit to Netlify via fetch ─────────────────────────────────────────────
  function submitToNetlify(form) {
    var data = new FormData(form);
    return fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString()
    }).catch(function () {
      // Silent fail — user experience continues regardless
    });
  }

  // ─── Build and show post-submit experience ───────────────────────────────────
  function showBookingExperience(data) {
    var calc = document.querySelector('#calculator');
    if (!calc) return;

    var lossFormatted = data.monthlyLoss.toLocaleString();
    var yearLoss      = (data.monthlyLoss * 12).toLocaleString();
    var isHighValue   = data.monthlyLoss >= HIGH_VALUE_THRESHOLD;
    var spaLabel      = data.spaName ? data.spaName + ' is losing' : "You're losing";
    var calendlyUrl   = isHighValue ? PRIORITY_CALENDLY_URL : STANDARD_CALENDLY_URL;

    var priorityNote = isHighValue
      ? '<div class="cb-priority-note">Based on your numbers, you qualify for a priority onboarding slot — setup within 48 hours of your call.</div>'
      : '';

    var badgeLabel = isHighValue
      ? '🔴 Priority Review'
      : '📊 Your Revenue Report';

    calc.innerHTML = `
      <div class="calc-booked-wrapper">

        <div class="cb-summary">
          <div class="cb-loss-badge${isHighValue ? ' cb-priority' : ''}">${badgeLabel}</div>
          <h2 class="cb-headline">
            ${spaLabel} <span class="cb-loss-amount">$${lossFormatted}</span> every month to empty chairs.
          </h2>
          <p class="cb-subline">
            That's $${yearLoss} a year — permanently gone once an appointment slot passes.
            A 45-minute call will show you exactly how to get it back.
          </p>
        </div>

        <div class="cb-columns">

          <div class="cb-what-happens">
            <h3>What happens on the call</h3>
            <ul class="cb-steps">
              <li>
                <span class="cb-step-num">01</span>
                <div>
                  <strong>We review your numbers</strong>
                  <p>We walk through your no-show rate, lapse patterns, and membership gap using your actual practice data — not industry averages.</p>
                </div>
              </li>
              <li>
                <span class="cb-step-num">02</span>
                <div>
                  <strong>We show you the platform live</strong>
                  <p>You see exactly how Aura AI runs inside your booking system. No slides. Real interface, real automations.</p>
                </div>
              </li>
              <li>
                <span class="cb-step-num">03</span>
                <div>
                  <strong>You decide if it fits</strong>
                  <p>No pressure. If it's not the right fit, we'll tell you. If it is, we can activate the same week.</p>
                </div>
              </li>
            </ul>
            <div class="cb-details">
              <span>⏱ 45 minutes</span>
              <span>📞 Video or phone</span>
              <span>✓ No credit card required</span>
            </div>
            ${priorityNote}
          </div>

          <div class="cb-calendly-col">
            <h3>Pick a time that works</h3>
            <div id="cb-calendly-embed" class="cb-calendly-embed"></div>
          </div>

        </div>
      </div>
    `;

    loadCalendlyEmbed('cb-calendly-embed', calendlyUrl, {
      name:  data.name,
      email: data.email
    });

    // Scroll smoothly to the new content
    calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Load and init Calendly inline widget ────────────────────────────────────
  function loadCalendlyEmbed(containerId, baseUrl, prefill) {
    function init() {
      if (!window.Calendly) {
        setTimeout(init, 200);
        return;
      }
      window.Calendly.initInlineWidget({
        url: baseUrl,
        parentElement: document.getElementById(containerId),
        prefill: {
          name:  prefill.name  || '',
          email: prefill.email || ''
        }
      });
    }

    if (!document.querySelector('script[src*="calendly"]')) {
      var link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = 'https://assets.calendly.com/assets/external/widget.css';
      document.head.appendChild(link);

      var script = document.createElement('script');
      script.src = 'https://assets.calendly.com/assets/external/widget.js';
      script.async = true;
      document.head.appendChild(script);
    }

    init();
  }

  // ─── Main init ───────────────────────────────────────────────────────────────
  function init() {
    var form = document.getElementById('calc-form');
    if (!form) return;

    injectStyles();
    addAttributionFields(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name       = (form.querySelector('input[name="name"]')     || {}).value || '';
      var email      = (form.querySelector('input[name="email"]')    || {}).value || '';
      var phone      = (form.querySelector('input[name="phone"]')    || {}).value || '';
      var spaName    = (form.querySelector('input[name="spa-name"]') || {}).value || '';
      var monthlyLoss = parseInt((document.getElementById('f-loss') || {}).value || '0', 10);
      var weeklyAppts = parseInt((document.getElementById('f-appts') || {}).value || '60', 10);
      var avgValue    = parseInt((document.getElementById('f-avgval') || {}).value || '220', 10);

      // Post to Netlify first, then show booking UI
      submitToNetlify(form).then(function () {
        showBookingExperience({ name, email, phone, spaName, monthlyLoss, weeklyAppts, avgValue });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
