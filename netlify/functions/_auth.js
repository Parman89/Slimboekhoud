// Gedeelde authenticatie- en CORS-helper voor de Netlify-functions.
// Verifieert het Supabase-sessietoken uit de Authorization-header.

// URL en publishable key zijn publiek (zoals in index.html). Bij voorkeur via
// environment-variabelen, met een fallback naar de bekende publieke waarden.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hzzebdtmudsmewfhwmjp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_j7_gI9TJWxlF6o_he6f_-g_3x7h9ZSc';

// Alleen onze eigen site mag de functions aanroepen.
const ALLOWED_ORIGIN = 'https://slimboekhoud.com';

// Verifieert de ingelogde gebruiker via Supabase.
// Geeft het user-object terug, of null wanneer er geen geldige login is.
async function getUser(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY }
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.id) return null;
    return user;
  } catch (e) {
    return null;
  }
}

// Standaard 401-antwoord wanneer de gebruiker niet is ingelogd.
function unauthorized(headers) {
  return { statusCode: 401, headers, body: JSON.stringify({ error: 'Niet ingelogd — log eerst in' }) };
}

module.exports = { getUser, unauthorized, ALLOWED_ORIGIN, SUPABASE_URL, SUPABASE_ANON_KEY };
