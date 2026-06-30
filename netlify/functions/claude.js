const { getUser, unauthorized, ALLOWED_ORIGIN } = require('./_auth');

// Server-side vastgezette instellingen. De client kan deze NIET overschrijven.
const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 2000;
const SYSTEM_PROMPT = 'Je bent de boekhoud-assistent van Slimboekhoud. ' +
  'Je helpt ondernemers met begrijpelijke uitleg over boekhouding, bonnen, btw en facturen in Nederland. ' +
  'Antwoord altijd in het Nederlands, kort en duidelijk. Geef geen juridisch of fiscaal bindend advies; ' +
  'verwijs bij twijfel naar een boekhouder of de Belastingdienst.';

// Eenvoudige rate limit per gebruiker (best effort, in-memory per function-instance).
const RATE_LIMIT_MAX = 20;          // max. aantal verzoeken
const RATE_LIMIT_WINDOW_MS = 60000; // per tijdvenster (60 seconden)
const rateBuckets = new Map();      // user.id -> { count, reset }

function rateLimited(userId) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now > bucket.reset) {
    rateBuckets.set(userId, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return true;
  bucket.count++;
  return false;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Login verplicht: zonder geldige Supabase-login niets uitvoeren.
  const user = await getUser(event);
  if (!user) return unauthorized(headers);

  // Rate limit per gebruiker.
  if (rateLimited(user.id)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: 'Te veel verzoeken — probeer het zo opnieuw' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not configured in Netlify Environment Variables' } })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Whitelist: alleen 'messages' mag van de client komen.
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldige invoer: messages ontbreekt of is leeg' }) };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      // model, max_tokens en system staan server-side vast en kunnen niet
      // door de client worden overschreven; alleen messages komt van buiten.
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages
      })
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { message: err.message } })
    };
  }
};
