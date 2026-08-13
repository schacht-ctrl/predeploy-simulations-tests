/* ==========================================================================
   content.js — Inhalte, Benennungen und Beschreibungen (Deutsch)
   Alle im Dashboard sichtbaren Texte, Metrik-/Szenario-Register und die
   Farbzuordnung der Agenten-Versionen.
   ========================================================================== */

/* --- Versionsfarben ------------------------------------------------------
   Validierte kategoriale Palette (dataviz-Checks, all-pairs):
   CVD ΔE 9.5 · Normalsicht ΔE 20.5 · Lightness-Band und Chroma-Floor bestanden.
   Reihenfolge ist FIX: V1 = Slot 1, V2 = Slot 2, … Farbe folgt der Version,
   nicht der Auswahlreihenfolge. Ab der 6. Version wird neutrales Grau
   verwendet (Identität dann ausschliesslich über Label/Legende).            */
const VERSION_SLOTS = [
  '#315DFF', // sipgate Blue Key
  '#D14D00', // Orange 10
  '#0E9B6B', // Green 24
  '#AD90FF', // Violet 40
  '#DCA72B', // Amber 40
];
const VERSION_FALLBACK = '#646464';
const MAX_COMPARE = 5;

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
  all_info_appointment_telonly: {
    name: 'Termindaten vollständig (nur Telefonnummer)',
    short: 'Termindaten vollständig (Tel.)',
    group: 'aufgabe',
    typ: 'LLM-as-a-Judge',
    direction: 'hoch',
    scale: 'binär (0 / 1) je Anruf, dargestellt als Anteil der Anrufe',
    frage: 'Hat die Assistenz alle notwendigen Angaben erhalten (Name, Anrufgrund und Telefonnummer)?',
    desc: 'Vollständigkeit der Datenerhebung im Termin-Szenario, wenn die anrufende Person keine E-Mail-Adresse herausgibt. Die Assistenz muss mit der Telefonnummer als einzigem Kontaktweg auskommen.',
    order: 14,
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
    hinweis: 'In der Konfiguration ohne Kalenderanbindung wird diese Metrik mitgemessen, obwohl dort gar kein Termin gebucht werden kann. Niedrige Werte sind dort erwartbar und kein Fehler – aussagekräftig ist sie nur in den Konfigurationen mit Kalenderanbindung.',
    order: 15,
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
};

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
      <p>Zwei Verhaltensregeln sind für die Auswertung entscheidend: Persönliche Angaben werden <strong>erst auf Nachfrage</strong> genannt – die Assistenz muss sie also aktiv erheben. Und nach der Verabschiedung interagiert die simulierte Person <strong>nicht weiter</strong>, auch wenn das Turn-Limit noch nicht erreicht ist.</p>`,
    },
    {
      id: 'aufbau',
      titel: 'Aufbau der Experimente',
      body: `<p>Jedes Experiment ist ein LangSmith-Lauf über einen Datensatz mit 100 Beispielen. Getestet wird die <strong>deployte Assistenz</strong> gegen die simulierte anrufende Person – ein vollständiges Telefonat pro Beispiel, protokolliert als Gesprächsverlauf (Trajektorie).</p>
      <p>Ein Datensatz entspricht einer <strong>Kombination aus Szenario und Agenten-Konfiguration</strong>. Die Konfiguration steuert unter anderem, ob eine <strong>Kalenderanbindung</strong> aktiv ist: ohne sie kann die Assistenz keine Termine buchen und muss auf einen Rückruf ausweichen.</p>
      <p>Anschliessend wird jeder Anruf bewertet – teils durch <strong>LLM-as-a-Judge</strong>-Metriken, teils <strong>regelbasiert</strong>. Angewendet werden nur die Metriken, die im jeweiligen Szenario sinnvoll sind; deshalb ist nicht jede Metrik für jeden Datensatz vorhanden.</p>`,
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
  if (cal === true) teile.push('Mit Kalender');
  else if (cal === false) teile.push('Ohne Kalender');
  if (kontakt !== 'unbekannt') teile.push(kontakt);
  teile.push(multi ? 'Multiinfo' : 'Basis');
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

function versionColor(version) {
  const m = /^[Vv](\d+)/.exec(version);
  const idx = m ? parseInt(m[1], 10) - 1 : -1;
  if (idx >= 0 && idx < VERSION_SLOTS.length) return VERSION_SLOTS[idx];
  return VERSION_FALLBACK;
}

const DIRECTION_GLYPH = { hoch: '↑', niedrig: '↓', ziel: '◎' };
const DIRECTION_TEXT = {
  hoch: 'hoch ist gut',
  niedrig: 'niedrig ist gut',
  ziel: 'Idealwert',
};
