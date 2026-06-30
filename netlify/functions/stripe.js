const { getUser, unauthorized, ALLOWED_ORIGIN, SUPABASE_URL, SUPABASE_ANON_KEY } = require('./_auth');

// Vaste abonnementsprijzen (server-side, niet door de client te overschrijven).
const PLAN_AMOUNTS = { starter: 900, pro: 1900 };

// Haalt het Supabase-sessietoken uit de Authorization-header.
function getToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  return auth.replace(/^Bearer\s+/i, '').trim();
}

// Haalt de echte factuur van de ingelogde gebruiker op uit Supabase.
// RLS zorgt dat een gebruiker alleen z'n eigen facturen kan zien.
async function haalFactuur(token, userId, factuurNr) {
  const url = SUPABASE_URL + '/rest/v1/facturen'
    + '?nummer=eq.' + encodeURIComponent(factuurNr)
    + '&user_id=eq.' + encodeURIComponent(userId)
    + '&select=nummer,klant,klant_email,totaal_excl,totaal_incl';
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Login verplicht: zonder geldige Supabase-login niets uitvoeren.
  const user = await getUser(event);
  if (!user) return unauthorized(headers);

  try {
    const { action, plan, factuurNr } = JSON.parse(event.body || '{}');

    const sk = process.env.STRIPE_SECRET_KEY;
    if (!sk) return { statusCode: 500, headers, body: JSON.stringify({ error: 'STRIPE_SECRET_KEY niet ingesteld' }) };

    // --- Abonnement starten (bedrag al server-side via vaste prijstabel) ---
    if (action === 'create_checkout') {
      const amt = PLAN_AMOUNTS[plan] || PLAN_AMOUNTS.starter;
      const name = plan === 'pro' ? 'SlimBoekhoud Pro' : 'SlimBoekhoud Starter';
      const params = new URLSearchParams({
        'mode': 'subscription',
        'payment_method_types[]': 'card',
        'payment_method_types[]': 'ideal',
        'customer_email': user.email || '',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][product_data][name]': name,
        'line_items[0][price_data][unit_amount]': amt,
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][quantity]': 1,
        'success_url': 'https://slimboekhoud.com?betaald=true',
        'cancel_url': 'https://slimboekhoud.com?betaald=geannuleerd',
        'subscription_data[trial_period_days]': 30
      });
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + sk, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const data = await res.json();
      if (data.url) return { statusCode: 200, headers, body: JSON.stringify({ url: data.url }) };
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.error?.message || 'Fout' }) };
    }

    // --- Betaallink voor een factuur (bedrag server-side uit de echte factuur) ---
    if (action === 'create_payment_link') {
      if (!factuurNr) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Factuurnummer vereist' }) };

      // Bedrag NIET uit het verzoek vertrouwen: ophalen uit de echte factuur.
      const token = getToken(event);
      const factuur = await haalFactuur(token, user.id, factuurNr);
      if (!factuur) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Factuur niet gevonden' }) };

      const incl = parseFloat(factuur.totaal_incl);
      const excl = parseFloat(factuur.totaal_excl);
      const euro = (!isNaN(incl) && incl > 0) ? incl : ((!isNaN(excl) && excl > 0) ? excl * 1.21 : 0);
      const amt = Math.round(euro * 100);
      if (!amt || amt < 50) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldig factuurbedrag' }) };

      // Omschrijving en klant-email ook uit de factuur, niet uit het verzoek.
      const naam = 'Factuur ' + factuur.nummer + (factuur.klant ? ' — ' + factuur.klant : '');
      const params = new URLSearchParams({
        'mode': 'payment',
        'payment_method_types[]': 'card',
        'payment_method_types[]': 'ideal',
        'customer_email': factuur.klant_email || '',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][product_data][name]': naam,
        'line_items[0][price_data][unit_amount]': amt,
        'line_items[0][quantity]': 1,
        'success_url': 'https://slimboekhoud.com?factuur_betaald=' + encodeURIComponent(factuur.nummer || ''),
        'cancel_url': 'https://slimboekhoud.com'
      });
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + sk, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const data = await res.json();
      if (data.url) return { statusCode: 200, headers, body: JSON.stringify({ url: data.url }) };
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.error?.message || 'Fout betaallink' }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende actie' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// VERVOLGSTAP (NIET nu gedaan): "betaald" veilig vaststellen via een Stripe-webhook
// (checkout.session.completed) met handtekening-verificatie via STRIPE_WEBHOOK_SECRET,
// die de factuur-/abonnementstatus server-side in Supabase bijwerkt. De ?betaald=...-
// URL-parameter blijft puur cosmetisch en mag nooit de bron van waarheid zijn.
