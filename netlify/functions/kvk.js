const { getUser, unauthorized, ALLOWED_ORIGIN } = require('./_auth');

// KvK API: gebruikt automatisch de productie-endpoint zodra KVK_API_KEY een
// echte productiesleutel is; valt anders terug op de openbare KvK-testsleutel
// (test-endpoint, alleen testdata).
const KVK_TEST_KEY = 'l7xx1f2691f2520d487185b1e8e0d30e7265';
const KVK_KEY = process.env.KVK_API_KEY || KVK_TEST_KEY;
const KVK_BASE = KVK_KEY === KVK_TEST_KEY
  ? 'https://api.kvk.nl/test/api/v1'
  : 'https://api.kvk.nl/api/v1';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Login verplicht: zonder geldige Supabase-login niets uitvoeren.
  const user = await getUser(event);
  if (!user) return unauthorized(headers);

  const kvk = event.queryStringParameters?.kvk?.trim();

  if (!kvk || !/^\d{8}$/.test(kvk)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Ongeldig KvK nummer — moet 8 cijfers zijn' })
    };
  }

  try {
    const res = await fetch(`${KVK_BASE}/basisprofielen/${kvk}`, {
      headers: { 'apikey': KVK_KEY }
    });

    if (!res.ok) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Bedrijf niet gevonden voor dit KvK nummer' })
      };
    }

    const data = await res.json();
    const adres = data.adressen?.[0] || {};

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        naam: data.naam || '',
        straatnaam: adres.straatnaam || '',
        huisnummer: adres.huisnummer ? String(adres.huisnummer) : '',
        postcode: adres.postcode || '',
        woonplaats: adres.woonplaatsnaam || ''
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'KvK lookup tijdelijk niet beschikbaar' })
    };
  }
};
