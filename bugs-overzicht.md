# Bugs-overzicht SlimBoekhoud

Overzicht van de 10 belangrijkste gevonden problemen, in gewone taal. Per punt: wat er mis is, hoe ernstig het is, en de globale oplossing. Er zijn nog geen fixes doorgevoerd.

Ernst-schaal: **Hoog** (snel oppakken) · **Midden** · **Laag**.

---

## #1 — De AI-functie is een open kraan op jouw rekening
**Bestand:** `netlify/functions/claude.js`
**Ernst:** Hoog (kritiek)

**Wat is er mis?** Iedereen die het webadres van deze functie kent, kan onbeperkt vragen naar de Claude-AI sturen — allemaal betaald met jouw API-sleutel. Er is geen inlog- of toegangscontrole. Bovendien kan de gebruiker zelf bepalen welk AI-model en welke instellingen gebruikt worden, dus het is in feite een gratis AI-dienst die jij betaalt.

**Globale oplossing:** Vereis dat een gebruiker ingelogd is voordat de functie iets doet, en sta alleen de strikt noodzakelijke gegevens toe (niet het hele verzoek vrij invulbaar). Voeg een limiet toe op het aantal verzoeken.

---

## #2 — Iedereen kan boekingen in je échte boekhouding zetten
**Bestand:** `netlify/functions/eboekhouden.js`
**Ernst:** Hoog (kritiek)

**Wat is er mis?** Deze functie staat open voor de hele wereld en heeft geen toegangscontrole. Daardoor kan iemand zonder in te loggen bonnen en mutaties wegschrijven naar je echte e-Boekhouden-administratie.

**Globale oplossing:** Eerst inlog/toegang controleren, en pas daarna een boeking toestaan.

---

## #3 — Factuurgegevens verdwijnen na opnieuw inloggen (bedragen worden "NaN")
**Bestand:** `index.html` (cloud-synchronisatie)
**Ernst:** Hoog (kritiek)

**Wat is er mis?** De app gebruikt op de telefoon andere veldnamen voor een factuur dan in de cloud (Supabase). Daardoor wordt bij het opslaan in de cloud het factuurbedrag als 0 en de vervaldatum als leeg weggeschreven. Omdat de cloud bij de volgende keer inloggen leidend is, ziet de gebruiker daarna "€ NaN" (geen geldig bedrag), lege vervaldatums, en raakt het projectveld definitief kwijt. Ook de balans, winst-en-verlies en BTW lopen daardoor mis.

**Globale oplossing:** De veldnamen tussen app en cloud gelijktrekken, zodat bedrag, vervaldatum en project correct worden opgeslagen én teruggeladen. Hetzelfde geldt voor offertes.

---

## #4 — Ontvangen omzet wordt na herladen als kosten geboekt
**Bestand:** `index.html` (cloud-synchronisatie)
**Ernst:** Hoog (kritiek)

**Wat is er mis?** Bij een bon wordt niet bewaard of het om inkomsten of uitgaven gaat. Na een keer synchroniseren met de cloud is dat verschil weg, en wordt elke inkomsten-bon weer als uitgave behandeld. Dat geeft een verkeerde BTW-aangifte en een verkeerde winstberekening.

**Globale oplossing:** Het type bon (inkomst/uitgave) — plus omschrijving en betaalwijze — meenemen bij het opslaan in de cloud en weer terugzetten bij het laden.

---

## #5 — Verwijderde items komen terug, en data kan stilletjes verdwijnen
**Bestand:** `index.html` (cloud-synchronisatie)
**Ernst:** Hoog

**Wat is er mis?** Bij het synchroniseren wordt eerst alles verwijderd en daarna opnieuw weggeschreven, zonder vangnet. Twee gevolgen: (1) verwijder je je láátste bon, factuur of klant, dan blijft de oude versie in de cloud staan en komt het verwijderde item later terug; (2) gaat het wegschrijven halverwege mis, dan kan de clouddata leeg achterblijven — zonder duidelijke foutmelding.

**Globale oplossing:** Niet "verwijderen-en-opnieuw-schrijven", maar bijwerken op basis van een vaste sleutel. Ook lege lijsten meenemen, en fouten netjes afvangen in plaats van alleen loggen.

---

## #6 — Klanten kunnen niet met kaart betalen (alleen iDEAL werkt)
**Bestand:** `netlify/functions/stripe.js`
**Ernst:** Hoog

**Wat is er mis?** Bij het instellen van de betaalmethoden wordt "kaart" per ongeluk overschreven door "iDEAL". Daardoor wordt creditcard nooit aangeboden en kunnen klanten alleen via iDEAL betalen.

**Globale oplossing:** De betaalmethoden zo opbouwen dat zowel kaart als iDEAL bewaard blijven.

---

## #7 — Betaallinks zijn onbeveiligd en "betaald" wordt te makkelijk vertrouwd
**Bestand:** `netlify/functions/stripe.js` + `index.html`
**Ernst:** Hoog

**Wat is er mis?** Iedereen kan via de open functie betaallinks met een willekeurig bedrag onder jouw Stripe-account aanmaken (risico op misbruik). Daarnaast wordt een betaling als "geslaagd" gezien op basis van een tekst in de webadres-balk (`betaald=true`), iets wat een gebruiker zelf kan typen. Er is geen echte controle bij Stripe.

**Globale oplossing:** Toegangscontrole en bedrag-validatie toevoegen, en een betaling pas als betaald markeren wanneer Stripe dat zelf bevestigt (via een webhook), niet op basis van het webadres.

---

## #8 — Betaallink rekent vaak het verkeerde bedrag (altijd 21% BTW)
**Bestand:** `index.html`
**Ernst:** Hoog

**Wat is er mis?** Bij het maken van een betaallink wordt het bedrag opnieuw berekend met 21% BTW, in plaats van het werkelijke factuurbedrag te gebruiken. Bij facturen met 9% of 0% BTW betaalt de klant daardoor te veel.

**Globale oplossing:** Het al berekende totaalbedrag van de factuur gebruiken, niet opnieuw met 21% rekenen.

---

## #9 — Opgeslagen AI-sleutel werkt nooit
**Bestand:** `index.html`
**Ernst:** Midden

**Wat is er mis?** De AI-sleutel wordt opgeslagen onder een andere naam dan waarmee hij later weer wordt opgehaald. Daardoor wordt een door de gebruiker opgeslagen sleutel nooit teruggevonden en blijft de app vragen om "voeg je API key toe".

**Globale oplossing:** Overal dezelfde naam voor de opslagsleutel gebruiken (opslaan én ophalen).

---

## #10 — Bonfoto's gaan verloren (terwijl je ze 7 jaar moet bewaren)
**Bestand:** `index.html`
**Ernst:** Hoog

**Wat is er mis?** Foto's van handmatig toegevoegde bonnen worden lokaal bewaard, maar niet meegenomen naar de cloud en niet teruggezet bij het laden. Omdat de cloud leidend is, is het bonbewijs na opnieuw inloggen weg — terwijl je dit volgens de bewaarplicht 7 jaar moet kunnen tonen.

**Globale oplossing:** Bonfoto's opslaan in de cloud-opslag (Supabase Storage) en bij het laden weer aan de bon koppelen.

---

*Opgesteld als overzicht; nog geen wijzigingen in de code doorgevoerd.*
