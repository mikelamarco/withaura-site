/**
 * submit-lead.js — Aura AI lead capture function
 *
 * Replaces Netlify Forms (not HIPAA-eligible) with a direct
 * Supabase insert so submissions stay in a BAA-covered database.
 *
 * Environment variables required in Netlify dashboard:
 *   SUPABASE_URL        → https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY → your service_role key (not anon key)
 *   NOTIFY_EMAIL        → email to notify on new lead (optional)
 *   RESEND_API_KEY      → Resend API key for email notify (optional)
 */

exports.handler = async function (event) {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let data;
  try {
    const contentType = event.headers['content-type'] || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      data = Object.fromEntries(new URLSearchParams(event.body));
    } else {
      data = JSON.parse(event.body);
    }
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // ── Validate required fields ────────────────────────────────────────────────
  const { name, email } = data;
  if (!name || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Name and email are required' }) };
  }
  if (!isValidEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid email address' }) };
  }

  // ── Honeypot check (bot trap) ───────────────────────────────────────────────
  if (data['bot-field']) {
    // Silently succeed — don't tell bots they failed
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // ── Build record ────────────────────────────────────────────────────────────
  const record = {
    name:          sanitize(name),
    email:         sanitize(email).toLowerCase(),
    phone:         sanitize(data.phone || ''),
    spa_name:      sanitize(data['spa-name'] || ''),
    monthly_loss:  toInt(data.monthly_loss || data['monthly-loss'] || '0'),
    weekly_appts:  toInt(data.weekly_appts  || data['weekly-appts']  || '0'),
    avg_value:     toInt(data.avg_value     || data['avg-value']     || '0'),
    utm_source:    sanitize(data.utm_source    || 'direct'),
    utm_medium:    sanitize(data.utm_medium    || ''),
    utm_campaign:  sanitize(data.utm_campaign  || ''),
    utm_content:   sanitize(data.utm_content   || ''),
    utm_term:      sanitize(data.utm_term      || ''),
    referrer:      sanitize(data.referrer       || ''),
    landing_page:  sanitize(data.landing_page   || ''),
    submitted_at:  new Date().toISOString(),
    source:        'calculator'
  };

  // ── Insert into Supabase ────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer':        'return=minimal'
      },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Supabase insert failed:', response.status, errBody);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save lead' }) };
    }
  } catch (err) {
    console.error('Supabase fetch error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Database connection failed' }) };
  }

  // ── Optional: email notification via Resend ─────────────────────────────────
  const resendKey   = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;

  if (resendKey && notifyEmail) {
    const isHighValue = record.monthly_loss >= 5000;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${resendKey}`
      },
      body: JSON.stringify({
        from: 'Aura AI <hello@withaura.io>',
        to:   [notifyEmail],
        subject: `${isHighValue ? '🔴 PRIORITY' : '📊 New'} Lead: ${record.name} — ${record.spa_name || 'unknown spa'} (${formatCurrency(record.monthly_loss)}/mo loss)`,
        html: `
          <h2 style="color:#2C1A0E;">New Aura AI Lead</h2>
          <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;width:160px;">Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.name}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.email}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.phone || '—'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Spa Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.spa_name || '—'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Monthly Loss</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:${isHighValue ? '#8b1a1a' : '#2E6B48'};font-weight:700;">${formatCurrency(record.monthly_loss)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Weekly Appts</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.weekly_appts}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Avg Service Value</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${formatCurrency(record.avg_value)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Source</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.utm_source}${record.utm_campaign ? ' / ' + record.utm_campaign : ''}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f0e8;font-weight:600;">Landing Page</td><td style="padding:8px 12px;">${record.landing_page || '/'}</td></tr>
          </table>
          ${isHighValue ? '<p style="margin-top:16px;padding:12px 16px;background:#fff4f4;border-left:4px solid #8b1a1a;font-weight:600;color:#5a1a1a;">PRIORITY LEAD — Monthly loss above $5,000. Follow up today.</p>' : ''}
          <p style="margin-top:24px;font-size:12px;color:#888;">Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
        `
      })
    }).catch(err => console.error('Resend notification failed:', err.message));
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function sanitize(str) {
  return String(str).trim().slice(0, 500);
}
function toInt(val) {
  const n = parseInt(String(val).replace(/[^0-9.-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function formatCurrency(n) {
  return '$' + Number(n).toLocaleString();
}
