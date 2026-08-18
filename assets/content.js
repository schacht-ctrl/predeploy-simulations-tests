/* ==========================================================================
   content.js — Inhalte, Benennungen und Beschreibungen (Deutsch)
   Alle im Dashboard sichtbaren Texte, Metrik-/Szenario-Register und die
   Farbzuordnung der Agenten-Versionen.
   ========================================================================== */

/* --- Versionsfarben ------------------------------------------------------
   Validierte kategoriale Palette (dataviz-Checks, all-pairs):
   CVD ΔE 9.5 · Normalsicht ΔE 20.5 · Lightness-Band und Chroma-Floor bestanden.

   Die Versionsbezeichnung ist der Ordnername im Datenrepository (z. B.
   „V1 OpenAI“). Die Farbe wird nach der sortierten Reihenfolge der Ordner
   vergeben: führende Versionsnummer, danach alphabetisch. Neue Ordner mit
   höherer Nummer kommen hinten dazu, bestehende Versionen behalten damit ihre
   Farbe. Ab der 6. Version wird neutrales Grau verwendet (Identität dann
   ausschliesslich über Label und Legende).                                  */
const VERSION_SLOTS = [
  '#315DFF', // sipgate Blue Key
  '#D14D00', // Orange 10
  '#0E9B6B', // Green 24
  '#AD90FF', // Violet 40
  '#DCA72B', // Amber 40
];
const VERSION_FALLBACK = '#646464';
const MAX_COMPARE = 5;

/* Feste Farbe für einen bestimmten Ordnernamen erzwingen (optional).
   Beispiel:  'V1 OpenAI': '#315DFF',                                        */
const VERSION_COLOR_OVERRIDES = {};

/* --- Metrik-Gruppen ----------------------------------------------------- */
const METRIC_GROUPS = [
  {
    id: 'aufgabe',
    name: 'Aufgabenerfüllung',
    desc: 'Hat die Assistenz das im Szenario vorgesehene Ziel erreicht?',
  },
  {
    id: 'gespraech',
    name: 'Gesprächsführung',
    desc: 'Wie gut führt die Assistenz das Gespräch unabhängig vom Szenario-Ziel?',
  },
];

/* --- Metriken ------------------------------------------------------------
   direction: 'hoch'   → hoher Wert ist gut
              'niedrig'→ niedriger Wert ist gut
              'ziel'   → es gibt einen Idealwert (target)                    */
const METRICS = {
  offer_callback: {
    name: 'Rückruf angeboten',
    short: 'Rückruf angeboten',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz der anrufenden Person erfolgreich einen Rückruf angeboten?',
    desc: 'Kern-Metrik des Rückruf-Szenarios. Die anrufende Person bittet ausdrücklich um einen Rückruf – die Assistenz muss dieses Angebot machen bzw. den Wunsch annehmen.',
    order: 10,
  },
  all_info_callback: {
    name: 'Rückrufdaten vollständig erfasst',
    short: 'Rückrufdaten vollständig',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz alle für einen Rückruf notwendigen Angaben erhoben (Name, Anrufgrund und Telefonnummer)?',
    desc: 'Prüft die Vollständigkeit der Datenerhebung im Rückruf-Szenario. Es zählt nur als erfüllt, wenn alle drei Angaben vorliegen.',
    order: 11,
  },
  offer_callback_appointment: {
    name: 'Rückruf als Alternative angeboten',
    short: 'Rückruf als Alternative',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz anstelle des gewünschten Termins einen Rückruf angeboten?',
    desc: 'Erwartetes Ausweichverhalten, wenn ein Termin nicht (oder nicht vollständig) gebucht werden kann. Statt das Gespräch ergebnislos zu beenden, soll die Assistenz einen Rückruf durch Mitarbeitende anbieten.',
    order: 12,
  },
  no_cal_disclosure: {
    name: 'Fehlende Terminbuchung offengelegt',
    short: 'Fehlende Buchung offengelegt',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz offengelegt, dass eine Terminbuchung nicht möglich ist?',
    desc: 'Transparenz-Metrik für die Konfiguration ohne Kalenderanbindung. Die Assistenz darf keine Terminbuchung suggerieren, die sie technisch nicht ausführen kann.',
    order: 13,
  },
  schedule_appointment: {
    name: 'Termin bestätigt oder Rückruf angeboten',
    short: 'Termin oder Rückruf',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz zurückgemeldet, dass sie einen Termin vereinbart hat – oder, wenn kein Termin möglich war, stattdessen einen Rückruf angeboten?',
    desc: 'Prüft, ob das Anliegen zu einem belastbaren Ergebnis geführt hat. Als erfüllt gilt beides: eine bestätigte Terminvereinbarung oder – falls kein Termin zustande kam – das Angebot eines Rückrufs. Ein Gespräch, das ohne beides endet, zählt nicht. Erhoben in der Konfiguration mit Kalenderanbindung und vollständigen Kontaktdaten.',
    order: 14,
  },
  all_info_appointment_telonly: {
    name: 'Termindaten vollständig (nur Telefonnummer)',
    short: 'Termindaten vollständig (Tel.)',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz alle notwendigen Angaben erhalten (Name, Anrufgrund und Telefonnummer)?',
    desc: 'Vollständigkeit der Datenerhebung im Termin-Szenario, wenn die anrufende Person keine E-Mail-Adresse herausgibt. Die Assistenz muss mit der Telefonnummer als einzigem Kontaktweg auskommen.',
    order: 15,
  },
  hallucinate_appointment: {
    name: 'Terminbuchung fälschlich behauptet',
    short: 'Buchung halluziniert',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'niedrig',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz behauptet, einen Termin vereinbart zu haben, obwohl sie technisch nicht über diese Fähigkeit verfügt?',
    desc: 'Fehlermetrik gegen Halluzinationen. Ein Wert von 1 bedeutet: Die Assistenz hat im Anruf eine Terminvereinbarung als erfolgt dargestellt, obwohl sie dazu technisch nicht in der Lage war. Erhoben in den Konfigurationen ohne Buchungsfähigkeit. Je niedriger, desto besser.',
    order: 17,
  },
  techsupport_correctness: {
    name: 'Auskunft inhaltlich korrekt',
    short: 'Auskunft korrekt',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz die Frage auf Basis der Wissensdatenbank korrekt beantwortet, ohne Details zu erfinden und ohne zu behaupten, sie könne nicht antworten?',
    desc: 'Kern-Metrik der beantwortbaren Anfragen. Als erfüllt gilt der Anruf nur, wenn alle drei Bedingungen zutreffen: die Antwort ist inhaltlich korrekt und durch die Wissensdatenbank gedeckt, es sind keine Details hinzuerfunden, und die Assistenz weicht nicht mit einem „Das kann ich nicht beantworten“ aus, obwohl die Information vorliegt.',
    order: 18,
  },
  techsupport_noinfo_disclosure: {
    name: 'Wissenslücke offengelegt',
    short: 'Wissenslücke offengelegt',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz wahrheitsgemäss offengelegt, dass sie die Frage nicht beantworten kann – ohne Details oder ganze Antworten zu erfinden?',
    desc: 'Gegenstück zur korrekten Auskunft: Bei nicht beantwortbaren Anfragen ist die Information nicht in der Wissensdatenbank enthalten. Erfüllt ist der Anruf, wenn die Assistenz die Grenze ihres Wissens klar benennt und dabei weder einzelne Details noch eine komplette Antwort erfindet.',
    order: 19,
  },
  all_info_appointment_telemail: {
    name: 'Termindaten vollständig (Telefon + E-Mail)',
    short: 'Termindaten vollständig (Tel. + E-Mail)',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz alle notwendigen Angaben erhalten, um einen Termin zu vereinbaren (Name, Anrufgrund, Telefonnummer und E-Mail-Adresse)?',
    desc: 'Vollständigkeit der Datenerhebung im Termin-Szenario, wenn die anrufende Person sowohl Telefonnummer als auch E-Mail-Adresse herausgibt.',
    // Ohne Kalenderanbindung ist keine Terminbuchung möglich; die Metrik wird
    // dort zwar mitgeschrieben, aber nicht ausgewertet.
    excludeIf: (dsName, info) => info.kalender === false,
    hinweis: 'Konfigurationen ohne Kalenderanbindung sind aus dieser Metrik ausgenommen: dort ist eine Terminbuchung technisch nicht möglich, die Datenerhebung also nicht das Ziel des Gesprächs. Die Werte in den Ergebnisdateien bleiben davon unberührt – sie werden im Dashboard nur nicht mitgerechnet.',
    order: 16,
  },
  call_reason_identified: {
    name: 'Anrufgrund korrekt erkannt',
    short: 'Anrufgrund erkannt',
    group: 'gespraech',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz den von der anrufenden Person genannten Anrufgrund korrekt erfasst?',
    desc: 'Grundlegende Verständnis-Metrik. Sie wird in allen Szenarien erhoben, weil jeder simulierte Anruf mit einem konkreten Anliegen beginnt.',
    order: 20,
  },
  info_duplicate: {
    name: 'Doppelte Abfrage von Angaben',
    short: 'Doppelte Abfrage',
    group: 'gespraech',
    typ: 'LLM-as-a-Judge',
    direction: 'niedrig',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz nach einer Angabe gefragt, die bereits genannt wurde und ihr vorliegen sollte?',
    desc: 'Fehlermetrik: Ein Wert von 1 bedeutet, dass im Anruf mindestens ein Info-Duplikat aufgetreten ist. Je niedriger, desto besser. Besonders relevant in den Multiinfo-Varianten, in denen die anrufende Person direkt zwei Angaben nennt.',
    order: 21,
  },
  danke_avg: {
    name: 'Dank-Anteil der Assistenz-Beiträge',
    short: 'Dank-Anteil',
    group: 'gespraech',
    typ: 'regelbasiert',
    direction: 'ziel',
    target: 0.25,
    scale: 'Anteil 0–100 % je Anruf, gemittelt über die Anrufe',
    frage: 'Wie viele Beiträge der Assistenz enthalten eine Dankesformel?',
    desc: 'Regelbasierte Auszählung: Anteil der Assistenz-Beiträge, die eine Variante des Wortstamms „dank“ enthalten. Zu wenig Dank wirkt schroff, zu viel wirkt aufdringlich und maschinell – deshalb ein Zielwert von 25 % statt „je mehr, desto besser“.',
    order: 22,
  },
  danke_score: {
    name: 'Dank-Score (Abweichung vom Idealwert)',
    short: 'Dank-Score',
    group: 'gespraech',
    typ: 'regelbasiert',
    direction: 'hoch',
    scale: '0–1 je Anruf, gemittelt über die Anrufe',
    frage: 'Wie nah liegt der Dank-Anteil am Idealwert von 25 %?',
    desc: 'Übersetzt den Dank-Anteil in eine Güte: asymmetrische Gauß-Funktion um den Idealwert von 25 %. 1,0 bedeutet ideal dosierten Dank, Werte gegen 0 bedeuten eine starke Abweichung nach oben oder unten. Die Asymmetrie gewichtet Abweichungen nach oben und unten unterschiedlich.',
    order: 23,
  },
};

/* --- Szenarien (Call-Szenarien der obersten Ebene) --------------------- */
const SCENARIOS = [
  {
    id: 'termin',
    name: 'Terminvereinbarung',
    kurz: 'Anrufende möchten einen Termin vereinbaren.',
    desc: 'Die simulierte anrufende Person möchte für ein konkretes Anliegen einen Termin vereinbaren. Getestet wird, wie die Assistenz damit in unterschiedlichen Konfigurationen umgeht: mit und ohne Kalenderanbindung sowie mit unterschiedlicher Auskunftsbereitschaft der anrufenden Person. Kann kein Termin gebucht werden, soll die Assistenz dies offenlegen und einen Rückruf anbieten.',
    match: (ds) => /appointment/i.test(ds),
  },
  {
    id: 'rueckruf',
    name: 'Rückruf',
    kurz: 'Anrufende möchten ausdrücklich zurückgerufen werden.',
    desc: 'Die simulierte anrufende Person bittet ausdrücklich um einen Rückruf durch Mitarbeitende und lehnt eine Terminbuchung explizit ab. Wird ein Termin als einzige Option angeboten, bricht sie das Gespräch mit dem Hinweis ab, es später erneut zu versuchen. Getestet wird, ob die Assistenz den Rückrufwunsch annimmt und die dafür nötigen Angaben erhebt.',
    match: (ds) => /callback/i.test(ds),
  },
  {
    id: 'techsupport',
    name: 'Auskunft und Support',
    kurz: 'Anrufende stellen eine Informations- oder Support-Anfrage.',
    desc: 'Die simulierte anrufende Person stellt eine Informations- oder Support-Anfrage und erwartet eine Auskunft – keine Terminbuchung und keinen Rückruf. Getestet wird die Auskunftsfähigkeit der Assistenz in zwei gegensätzlichen Lagen: einmal ist die Antwort in der Wissensdatenbank enthalten, einmal nicht. Beide Lagen prüfen dieselbe Eigenschaft aus zwei Richtungen – nämlich ob sich die Assistenz an ihr tatsächliches Wissen hält: korrekt antworten, wo die Information vorliegt, und die Lücke benennen, wo sie fehlt. Erfundene Details sind in beiden Fällen ein Fehler.',
    match: (ds) => /techsupport/i.test(ds),
  },
];

/* --- Datensätze (Sub-Szenarien) ---------------------------------------- */
const DATASETS = {
  PREDEPLOY_appointment_sim_nocal_telemail_100: {
    name: 'Ohne Kalender · Basis',
    scenario: 'termin',
    kalender: false,
    kontakt: 'Telefon + E-Mail',
    variante: 'Basis',
    desc: 'Die anrufende Person möchte einen Termin vereinbaren und ist bereit, Telefonnummer und E-Mail-Adresse zu nennen. Die Assistenz läuft ohne Kalenderanbindung und kann deshalb keine Termine buchen. Erwartet wird: die fehlende Buchungsmöglichkeit offenlegen und einen Rückruf anbieten.',
    prompt: 'prompts/caller_appointment_v2_telemail.txt',
  },
  PREDEPLOY_appointment_sim_nocal_telemail_100_multiinfo: {
    name: 'Ohne Kalender · Multiinfo',
    scenario: 'termin',
    kalender: false,
    kontakt: 'Telefon + E-Mail',
    variante: 'Multiinfo',
    desc: 'Wie „Ohne Kalender · Basis“, aber die anrufende Person nennt bereits im ersten Beitrag zwei Angaben gleichzeitig. Damit wird geprüft, ob die Assistenz beide Angaben registriert oder später erneut nach einer bereits genannten Angabe fragt.',
    prompt: 'prompts/caller_appointment_v2_telemail.txt',
  },
  PREDEPLOY_appointment_sim_cal_telonly_100: {
    name: 'Mit Kalender · nur Telefon · Basis',
    scenario: 'termin',
    kalender: true,
    kontakt: 'nur Telefon',
    variante: 'Basis',
    desc: 'Die anrufende Person möchte einen Termin vereinbaren, gibt aber ausschliesslich ihre Telefonnummer und keine E-Mail-Adresse heraus. Die Assistenz hat eine Kalenderanbindung und könnte grundsätzlich buchen – muss dabei aber mit der Telefonnummer als einzigem Kontaktweg auskommen.',
    prompt: 'prompts/caller_appointment_v2_telonly.txt',
  },
  PREDEPLOY_appointment_sim_cal_telonly_100_multiinfo: {
    name: 'Mit Kalender · nur Telefon · Multiinfo',
    scenario: 'termin',
    kalender: true,
    kontakt: 'nur Telefon',
    variante: 'Multiinfo',
    desc: 'Wie „Mit Kalender · nur Telefon · Basis“, aber die anrufende Person nennt bereits im ersten Beitrag zwei Angaben gleichzeitig.',
    prompt: 'prompts/caller_appointment_v2_telonly.txt',
  },
  PREDEPLOY_appointment_sim_cal_telemail_100: {
    name: 'Mit Kalender · Telefon + E-Mail · Basis',
    scenario: 'termin',
    kalender: true,
    kontakt: 'Telefon + E-Mail',
    variante: 'Basis',
    desc: 'Die anrufende Person möchte einen Termin vereinbaren und ist bereit, Telefonnummer und E-Mail-Adresse zu nennen. Die Assistenz hat eine Kalenderanbindung – das günstigste Setup für eine vollständige Terminbuchung.',
    prompt: 'prompts/caller_appointment_v2_telemail.txt',
  },
  PREDEPLOY_appointment_sim_cal_telemail_100_multiinfo: {
    name: 'Mit Kalender · Telefon + E-Mail · Multiinfo',
    scenario: 'termin',
    kalender: true,
    kontakt: 'Telefon + E-Mail',
    variante: 'Multiinfo',
    desc: 'Wie „Mit Kalender · Telefon + E-Mail · Basis“, aber die anrufende Person nennt bereits im ersten Beitrag zwei Angaben gleichzeitig.',
    prompt: 'prompts/caller_appointment_v2_telemail.txt',
  },
  PREDEPLOY_callback_sim_100: {
    name: 'Rückruf-Wunsch',
    scenario: 'rueckruf',
    kalender: true,
    kontakt: 'Telefon + E-Mail + Kundennummer',
    variante: 'Basis',
    desc: 'Die anrufende Person bittet ausdrücklich um einen Rückruf und lehnt eine Terminbuchung ab. Sie nennt Name, Telefonnummer, E-Mail-Adresse, Kundennummer und Erreichbarkeit erst auf Nachfrage.',
    prompt: 'prompts/caller_callback_v2.txt',
  },
  PREDEPLOY_techsupport_sim_answerable_100: {
    name: 'Beantwortbare Anfrage',
    scenario: 'techsupport',
    kalender: null,
    kontakt: 'Telefon + E-Mail + Kundennummer',
    variante: 'Basis',
    desc: 'Die anrufende Person stellt eine Informations- oder Support-Anfrage, deren Antwort in der Wissensdatenbank der Assistenz enthalten ist. Erwartet wird eine wahrheitsgemässe, korrekte Auskunft – ohne erfundene Details und ohne dass die Assistenz behauptet, sie könne die Frage nicht beantworten.',
    prompt: 'prompts/caller_techsupport_v1.txt',
  },
  PREDEPLOY_techsupport_sim_unanswerable_100: {
    name: 'Nicht beantwortbare Anfrage',
    scenario: 'techsupport',
    kalender: null,
    kontakt: 'Telefon + E-Mail + Kundennummer',
    variante: 'Basis',
    desc: 'Die anrufende Person stellt eine Informations- oder Support-Anfrage, die sich mit der Wissensdatenbank nicht beantworten lässt. Erwartet wird, dass die Assistenz dies wahrheitsgemäss offenlegt, statt einzelne Details oder eine ganze Antwort zu erfinden.',
    prompt: 'prompts/caller_techsupport_v1.txt',
  },
};

/* --- Kennzahlen der Übersicht ------------------------------------------
   Jede Kachel in „Was in dieser Auswertung steckt“ ist anklickbar und öffnet
   die Aufschlüsselung nach Szenario und Version.
     agg     'sum'  → über Szenarien addiert
             'mean' → nach Anzahl Anrufe gewichtetes Mittel
     runs    true   → braucht die Runs-Dateien (Werte je Anruf)              */
const KPI_MEASURES = [
  {
    id: 'calls',
    label: 'Simulationsanrufe',
    desc: 'Anzahl vollständig simulierter Telefonate. Pro Datensatz sind es 100 Anrufe; die Summe hängt davon ab, wie viele Datensätze für eine Version vorliegen.',
    agg: 'sum',
    charts: [{ label: 'Anrufe', unit: '', fmt: 'int', field: 'calls' }],
  },
  {
    id: 'datasets',
    label: 'Datensätze',
    desc: 'Anzahl ausgewerteter Datensätze (Sub-Szenarien) je Szenario. Unterschiede zwischen Versionen zeigen, welche Läufe noch fehlen.',
    agg: 'sum',
    charts: [{ label: 'Datensätze', unit: '', fmt: 'int', field: 'datasets' }],
  },
  {
    id: 'metrics',
    label: 'Metriken',
    desc: 'Welche Metriken im jeweiligen Szenario angewendet wurden. Metriken werden nur dort erhoben, wo sie inhaltlich sinnvoll sind.',
    agg: 'sum',
    table: 'metrics',
    charts: [{ label: 'Angewendete Metriken', unit: '', fmt: 'int', field: 'metrics' }],
  },
  {
    id: 'errors',
    label: 'Fehlerrate',
    desc: 'Anteil der Läufe mit technischem Fehler (Abbruch, Zeitüberschreitung, Fehlermeldung). Inhaltliche Fehler der Assistenz zählen hier nicht – die stehen in den Metriken.',
    agg: 'mean',
    charts: [{ label: 'Fehlerrate', unit: '%', fmt: 'pct', field: 'errorRate' }],
  },
  {
    id: 'duration',
    label: 'Gesprächsdauer p50',
    desc: 'Dauer und Länge der Gespräche. Die Latenz stammt aus der Summary-Datei, die Turn-Kennzahlen werden aus den Einzelanrufen der Runs-Dateien berechnet. Ein Turn ist ein Gesprächsbeitrag; die Assistenz-Turns sind die Beiträge der Assistenz, die Gesamt-Turns umfassen beide Seiten.',
    agg: 'mean',
    runs: true,
    charts: [
      { label: 'Latenz p50 je Anruf', unit: 's', fmt: 'sec', field: 'latencyP50', hint: 'Median der Anrufdauer laut Summary-Datei' },
      { label: 'Assistenz-Turns je Anruf (Ø)', unit: '', fmt: 'num1', field: 'assistantTurns', runs: true },
      { label: 'Turns gesamt je Anruf (Ø)', unit: '', fmt: 'num1', field: 'totalTurns', runs: true },
      { label: 'Turn-Dauer (Ø)', unit: 's', fmt: 'sec2', field: 'avgTurnDuration', runs: true },
    ],
  },
  {
    id: 'cost',
    label: 'Modellkosten',
    desc: 'Kosten und Token-Verbrauch der Läufe. Die Kosten je Anruf machen Szenarien unterschiedlicher Größe vergleichbar.',
    agg: 'sum',
    charts: [
      { label: 'Kosten gesamt', unit: '$', fmt: 'usd', field: 'cost' },
      { label: 'Kosten je Anruf', unit: '$', fmt: 'usd4', field: 'costPerCall', agg: 'mean' },
      { label: 'Tokens gesamt', unit: '', fmt: 'int', field: 'tokens' },
      { label: 'Tokens je Anruf', unit: '', fmt: 'int', field: 'tokensPerCall', agg: 'mean' },
    ],
  },
];

/* --- Erklärtexte -------------------------------------------------------- */
const TEXTS = {
  titel: 'Pre-Deploy Simulations Tests',
  untertitel: 'Simulierte Telefonate mit der digitalen Anruf-Assistentin von Surfers Immobilien',
  intro: [
    {
      id: 'genossenschaft',
      titel: 'Die Genossenschaft',
      body: `<p><strong>Surfers Immobilien</strong> ist eine fiktive Wohnungsgenossenschaft in Düsseldorf, die als Testumgebung für die digitale Anruf-Assistentin dient. Sie vermietet Wohnungen nicht wie ein klassischer Vermieter: Man kauft Genossenschaftsanteile, wird damit Mitglied und kann anschliessend günstig und dauerhaft dort wohnen.</p>
      <p>Die Genossenschaft ist nicht auf Gewinn ausgerichtet, sondern darauf, ihre Mitglieder mit bezahlbarem Wohnraum zu versorgen. Sie verwaltet knapp <strong>8.000 Wohnungen</strong> in der Stadt und baut laufend neue.</p>
      <p class="muted">Alle Anrufe, Namen, Telefonnummern und Kundennummern in diesem Dashboard sind synthetisch. Es handelt sich um keine echten Personen und keine echte Genossenschaft.</p>`,
    },
    {
      id: 'anrufende',
      titel: 'Die simulierten Anrufenden',
      body: `<p>Der Gegenpart der Assistenz ist kein Mensch, sondern ein zweites Sprachmodell mit einem festen Rollen-Prompt. Es spielt eine anrufende Person, die auf Deutsch spricht, freundlich bleibt, ihre Antworten kurz hält und in der Rolle bleibt.</p>
      <p>Pro Anruf werden Variablen aus dem Datensatz eingesetzt: <strong>Name</strong>, <strong>Anrufgrund</strong>, <strong>Telefonnummer</strong>, je nach Szenario <strong>E-Mail-Adresse</strong> und <strong>Kundennummer</strong> sowie die <strong>Erreichbarkeit</strong>. So entstehen 100 unterschiedliche Anrufe pro Datensatz mit identischer Gesprächsabsicht.</p>
      <p>Zwei Verhaltensregeln sind für die Auswertung entscheidend: Persönliche Angaben werden <strong>erst auf Nachfrage</strong> genannt – die Assistenz muss sie also aktiv erheben. Und nach der Verabschiedung interagiert die simulierte Person <strong>nicht weiter</strong>, auch wenn das Turn-Limit noch nicht erreicht ist.</p>
      <p>Das gewünschte Ergebnis unterscheidet sich je Szenario: Im Termin-Szenario akzeptiert die anrufende Person einen Rückruf, falls kein Termin möglich ist. Im Rückruf-Szenario lehnt sie eine Terminbuchung ausdrücklich ab. Bei Auskunft und Support stellt sie <strong>genau eine Frage</strong>, fragt von sich aus nicht nach einem Rückruf und lehnt weitere Angebote der Assistenz ab – dadurch sind diese Gespräche deutlich kürzer.</p>`,
    },
    {
      id: 'aufbau',
      titel: 'Aufbau der Experimente',
      body: `<p>Jedes Experiment ist ein LangSmith-Lauf über einen Datensatz mit 100 Beispielen. Getestet wird die <strong>deployte Assistenz</strong> gegen die simulierte anrufende Person – ein vollständiges Telefonat pro Beispiel, protokolliert als Gesprächsverlauf (Trajektorie).</p>
      <p>Ein Datensatz entspricht einer <strong>Kombination aus Szenario und Agenten-Konfiguration</strong>. Die Konfiguration steuert unter anderem, ob eine <strong>Kalenderanbindung</strong> aktiv ist: ohne sie kann die Assistenz keine Termine buchen und muss auf einen Rückruf ausweichen.</p>
      <p>Anschliessend wird jeder Anruf bewertet – teils durch <strong>LLM-as-a-Judge</strong>-Metriken, teils <strong>regelbasiert</strong>. Angewendet werden nur die Metriken, die im jeweiligen Szenario sinnvoll sind; deshalb ist nicht jede Metrik für jeden Datensatz vorhanden.</p>
      <p>Eine <strong>Version</strong> ist ein solcher Testlauf über alle Szenarien – benannt nach dem Ordner im Datenrepository, zum Beispiel nach dem eingesetzten Sprachmodell. Über die Filterzeile lassen sich mehrere Versionen gleichzeitig auswählen und damit direkt vergleichen.</p>`,
    },
    {
      id: 'metriktypen',
      titel: 'Metrik-Typen und Lesart',
      body: `<p><strong>LLM-as-a-Judge:</strong> Ein bewertendes Sprachmodell beurteilt den Gesprächsverlauf anhand einer klar formulierten Frage und liefert pro Anruf 0 oder 1. Der Datensatz-Wert ist der Anteil der Anrufe mit 1.</p>
      <p><strong>Regelbasiert:</strong> Deterministische Auszählung im Transkript, ohne Modellurteil. Hier entstehen kontinuierliche Werte, die auch innerhalb eines Datensatzes streuen.</p>
      <p>Nicht bei jeder Metrik ist ein hoher Wert gut. Die Zielrichtung steht in jeder Zeile: <strong>↑</strong> hoch ist gut, <strong>↓</strong> niedrig ist gut, <strong>◎</strong> es gibt einen Idealwert.</p>`,
    },
  ],
  multiinfo: 'Multiinfo-Variante: Die simulierte anrufende Person nennt bereits im ersten, skriptgesteuerten Beitrag zwei Angaben gleichzeitig statt nur einer. So lässt sich prüfen, ob die Assistenz beide Angaben von Anfang an registriert – oder nur eine und später erneut nach der bereits genannten Angabe fragt (Info-Duplikat).',
  aggHinweis: 'Aggregiert über alle Datensätze, in denen die Metrik erhoben wurde – gewichtet nach der Anzahl Anrufe.',
  kpiHinweis: 'Kachel anklicken für die Aufschlüsselung nach Szenario und Version.',
  noRuns: 'Für diese Datensätze liegen noch keine Runs-Dateien im Datenrepository. Die aggregierten Werte stammen aus der Summary-Datei; Verteilungen, Turn-Kennzahlen und Beispielgespräche erscheinen automatisch, sobald die Einzelergebnisse nachgeliefert werden.',
  noRunsShort: 'Einzelergebnisse fehlen noch',
};

/* --- Zugriffshelfer mit Fallback für künftige Metriken/Datensätze ------- */
function metricInfo(key) {
  if (METRICS[key]) return METRICS[key];
  return {
    name: key.replace(/_/g, ' '),
    short: key.replace(/_/g, ' '),
    group: 'gespraech',
    typ: 'unbekannt',
    direction: 'hoch',
    scale: 'unbekannt',
    frage: '',
    desc: 'Für diese Metrik liegt noch keine Beschreibung im Dashboard. Sie wurde automatisch aus den Ergebnisdateien übernommen.',
    order: 900,
    unbekannt: true,
  };
}

function datasetInfo(dsName) {
  if (DATASETS[dsName]) return DATASETS[dsName];
  // Heuristik für künftige Datensätze
  const cal = /(^|_)cal(_|$)/.test(dsName) ? true : /nocal/.test(dsName) ? false : null;
  const multi = /multiinfo/.test(dsName);
  const kontakt = /telemail/.test(dsName) ? 'Telefon + E-Mail'
    : /telonly/.test(dsName) ? 'nur Telefon' : 'unbekannt';
  const sc = SCENARIOS.find((s) => s.match(dsName));
  const teile = [];
  if (/techsupport/i.test(dsName)) {
    if (/unanswerable/i.test(dsName)) teile.push('Nicht beantwortbare Frage');
    else if (/answerable/i.test(dsName)) teile.push('Beantwortbare Frage');
  }
  if (!teile.length) {
    if (cal === true) teile.push('Mit Kalender');
    else if (cal === false) teile.push('Ohne Kalender');
    if (kontakt !== 'unbekannt') teile.push(kontakt);
    teile.push(multi ? 'Multiinfo' : 'Basis');
  } else if (multi) {
    teile.push('Multiinfo');
  }
  return {
    name: teile.join(' · ') || dsName,
    scenario: sc ? sc.id : 'termin',
    kalender: cal,
    kontakt,
    variante: multi ? 'Multiinfo' : 'Basis',
    desc: 'Für diesen Datensatz liegt noch keine Beschreibung im Dashboard. Benennung und Zuordnung wurden automatisch aus dem Datensatznamen abgeleitet.',
    unbekannt: true,
  };
}

/* Gilt die Metrik für diesen Datensatz? Manche Metriken werden mitgeschrieben,
   sind aber in bestimmten Konfigurationen inhaltlich nicht auswertbar.       */
function metricApplies(metricKey, dsName, info) {
  const mi = METRICS[metricKey];
  if (!mi || typeof mi.excludeIf !== 'function') return true;
  return !mi.excludeIf(dsName, info || datasetInfo(dsName));
}

/* Sortierschlüssel für Versionsordner: führende Nummer, dann Name. Damit
   behalten bestehende Versionen ihre Position – und ihre Farbe.             */
function versionSortKey(name) {
  const m = /^\s*[Vv]?(\d+)/.exec(name);
  return [m ? parseInt(m[1], 10) : 1e6, String(name).toLocaleLowerCase('de')];
}
function compareVersions(a, b) {
  const ka = versionSortKey(a), kb = versionSortKey(b);
  return ka[0] - kb[0] || ka[1].localeCompare(kb[1], 'de');
}

const DIRECTION_GLYPH = { hoch: '↑', niedrig: '↓', ziel: '◎' };
const DIRECTION_TEXT = {
  hoch: 'hoch ist gut',
  niedrig: 'niedrig ist gut',
  ziel: 'Idealwert',
};
