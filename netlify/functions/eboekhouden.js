const { getUser, unauthorized, ALLOWED_ORIGIN } = require('./_auth');

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Login verplicht: zonder geldige Supabase-login niets uitvoeren.
  const user = await getUser(event);
  if (!user) return unauthorized(headers);

  const token = process.env.EBOEKHOUDEN_TOKEN;
  if (!token) return { statusCode: 500, headers, body: JSON.stringify({ error: 'EBOEKHOUDEN_TOKEN niet ingesteld' }) };

  const base = 'https://api.e-boekhouden.nl/v1';
  const PAY = 37982896; // bank-/betaalrekening
  const catLedger = { Materiaal: 37982905, Brandstof: 47187595, Gereedschap: 50026188, Verzekering: 51983667, Telefoon: 37982925, Transport: 37982922, Subcontractor: 47187592, Onderaannemer: 47187592, Overig: 37982926 };

  // Omzet-grootboekrekeningen (voor inkomst-bonnen / geld ontvangen)
  const omzetLedger = (p) => (p == 9 ? 37982906 : (p == 0 ? 47187640 : 47187639));

  try {
    const { action, data } = JSON.parse(event.body || '{}');

    const sRes = await fetch(base + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: token, source: 'SlimBoek' }) });
    const sRaw = await sRes.text();
    if (!sRes.ok) return { statusCode: 200, headers, body: JSON.stringify({ success: false, step: 'session', status: sRes.status, raw: sRaw.substring(0, 300) }) };
    let sJson; try { sJson = JSON.parse(sRaw); } catch (e) { sJson = {}; }
    const sToken = sJson.token;
    const ah = { 'Authorization': sToken, 'Content-Type': 'application/json' };

    const vatCode = (p) => (p == 9 ? 'LAAG_INK_9' : (p == 0 ? 'GEEN' : 'HOOG_INK_21'));
    const vatCodeVerk = (p) => (p == 9 ? 'LAAG_VERK_9' : (p == 0 ? 'GEEN' : 'HOOG_VERK_21'));

    if (action === 'test') {
      const r = await fetch(base + '/ledger?limit=500', { headers: ah });
      const raw = await r.text();
      let result; try { result = JSON.parse(raw); } catch (e) { result = raw; }
      const items = (result && result.items) ? result.items.map(l => ({ id: l.id, code: l.code, desc: l.description })) : result;
      return { statusCode: 200, headers, body: JSON.stringify({ success: r.ok, sessionOk: true, ledgers: items }) };
    }

    if (action === 'stuur_bon') {
      // --- Invoer valideren: ongeldige bonnen netjes weigeren ---
      if (!data || typeof data !== 'object') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bon-gegevens ontbreken' }) };
      }
      if (!data.datum || !/^\d{4}-\d{2}-\d{2}/.test(String(data.datum))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Datum ontbreekt of is ongeldig (verwacht JJJJ-MM-DD)' }) };
      }
      const bedrag = (data.incl != null && data.incl !== '') ? data.incl : data.excl;
      if (isNaN(parseFloat(bedrag)) || parseFloat(bedrag) <= 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bedrag ontbreekt of is ongeldig (moet groter dan 0 zijn)' }) };
      }
      if (data.soort != null && !['inkomst', 'uitgave', 'kosten'].includes(data.soort)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldige soort bon (alleen inkomst of uitgave)' }) };
      }
      if (data.cat != null && data.cat !== '' && !(data.cat in catLedger)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende categorie' }) };
      }
      // --- einde validatie ---

      let pct = 21;
      if (data.btwPct != null) pct = data.btwPct; else if (data.btw_pct != null) pct = data.btw_pct; else if (data.pct != null) pct = data.pct;
      pct = parseFloat(pct); if (isNaN(pct)) pct = 21;
      if (![0, 9, 21].includes(pct)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ongeldig BTW-percentage (alleen 0, 9 of 21)' }) };
      }
      const amount = (data.incl != null && data.incl !== '') ? data.incl : data.excl;

      // INKOMST-BON -> Geld ontvangen (type 5) met omzet-rekening + verkoop-BTW
      if (data.soort === 'inkomst') {
        const mutIn = {
          type: 5,
          date: data.datum,
          ledgerId: PAY,
          description: (data.leverancier || 'Ontvangen') + ' - Omzet',
          inExVat: 'IN',
          rows: [{ ledgerId: omzetLedger(pct), vatCode: vatCodeVerk(pct), amount: amount, description: data.note || data.notitie || data.omschrijving || data.leverancier || 'Omzet' }]
        };
        const rIn = await fetch(base + '/mutation', { method: 'POST', headers: ah, body: JSON.stringify(mutIn) });
        const rawIn = await rIn.text();
        let resultIn; try { resultIn = JSON.parse(rawIn); } catch (e) { resultIn = rawIn; }
        return { statusCode: rIn.ok ? 200 : 400, headers, body: JSON.stringify({ success: rIn.ok, result: resultIn }) };
      }

      // KOSTEN-BON -> Geld uitgegeven (type 6) - ongewijzigd
      const exp = catLedger[data.cat] || catLedger.Overig;
      const mut = {
        type: 6,
        date: data.datum,
        ledgerId: PAY,
        description: (data.leverancier || 'Bon') + ' - ' + (data.cat || 'Overig'),
        inExVat: 'IN',
        rows: [{ ledgerId: exp, vatCode: vatCode(pct), amount: amount, description: data.note || data.notitie || data.omschrijving || data.leverancier || data.cat || 'Bon' }]
      };
      const r = await fetch(base + '/mutation', { method: 'POST', headers: ah, body: JSON.stringify(mut) });
      const raw = await r.text();
      let result; try { result = JSON.parse(raw); } catch (e) { result = raw; }
      return { statusCode: r.ok ? 200 : 400, headers, body: JSON.stringify({ success: r.ok, result }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Onbekende actie' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
