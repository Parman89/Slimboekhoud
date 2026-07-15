const { getUser, unauthorized, ALLOWED_ORIGIN } = require('./_auth');

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
    const res = await fetch(`https://api.kvk.nl/test/api/v1/basisprofielen/${kvk}`, {
      headers: { 'apikey': process.env.KVK_API_KEY }
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
