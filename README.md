# Pre-Deploy Simulations Tests

Dashboard und Datenablage für die LangSmith-Simulationsexperimente der digitalen
Anruf-Assistentin von **Surfers Immobilien** (fiktive Wohnungsgenossenschaft,
Testumgebung).

Das Dashboard ist eine statische Seite ohne Build-Schritt. Es lädt die
Ergebnisdaten **zur Laufzeit direkt aus diesem Repository**. Neue Daten werden
also allein durch einen Push in dieses Repo sichtbar – die Seite muss dafür
nicht erneut deployt werden.

## Ordnerstruktur

```
/
├── index.html              ← Dashboard (Netlify Publish Directory = Repo-Root)
├── assets/
│   ├── styles.css          ← sipgate Brand Design
│   ├── content.js          ← alle Texte: Metriken, Szenarien, Datensätze, Erklärungen
│   ├── charts.js           ← SVG-Diagramme (Punktdiagramm, Punktraster, Histogramm)
│   └── app.js              ← Laden, Auswerten, Rendern  (CONFIG steht oben in der Datei)
├── manifest.json           ← Verzeichnis der Datendateien (automatisch erzeugt)
├── scripts/build_manifest.py
├── .github/workflows/manifest.yml
├── netlify.toml
├── V1 OpenAI/              ← ein Ordner pro Agenten-Version
│   ├── summary.csv
│   └── runs__<experiment>.csv
├── V1 SipgateAI/
└── V2 …/                   ← zukünftige Version, einfach anlegen
```

## Versionsbezeichnungen

Die Version ist **der vollständige Ordnername** – so wie er im Repository steht,
inklusive Leerzeichen und Zusätzen: `V1 OpenAI`, `V1 SipgateAI`, `V2 OpenAI`.
Genau dieser Name erscheint in der Filterzeile, in den Legenden, den
Wertespalten und den Tabellen.

Als Version gilt **jeder Ordner im Repo-Root**, der mindestens eine CSV-Datei
enthält – ausgenommen die Infrastrukturordner `assets`, `scripts`, `.github` und
alles, was mit einem Punkt beginnt. Es gibt kein Namensschema, an das man sich
halten muss.

Sortierung und Farbvergabe: nach führender Versionsnummer, danach alphabetisch.
Neue Ordner mit höherer Nummer landen hinten, bestehende Versionen behalten damit
ihre Farbe. Wer eine Farbe festnageln will, trägt sie in
`VERSION_COLOR_OVERRIDES` in `assets/content.js` ein.

## Neue Ergebnisse hinzufügen

**Gleiche Version, aktualisierte Daten:** Datei im Versionsordner ersetzen,
committen, pushen. Fertig – beim nächsten Laden zeigt das Dashboard die neuen
Werte. (Ein Cache-Buster auf Basis des Git-SHA verhindert veraltete Ansichten.)

**Neue Version:**

1. Ordner anlegen, z. B. `V2 OpenAI/`.
2. Summary-CSV und Runs-CSVs des LangSmith-Exports hineinlegen.
3. Committen und pushen.
4. Dashboard neu laden – die Version erscheint in der Filterzeile und lässt sich
   mit den anderen vergleichen (Mehrfachauswahl, bis zu fünf gleichzeitig).

**Nachträglich fehlende Läufe ergänzen:** Runs-Datei in den Versionsordner legen,
pushen – mehr ist nicht nötig. Das Dashboard zeigt Szenarien, sobald sie in der
Summary-Datei stehen, auch wenn die zugehörige Runs-Datei noch fehlt. In diesem
Fall erscheinen die aggregierten Werte wie gewohnt, und bei den Verteilungen,
Turn-Kennzahlen und Beispielgesprächen steht ein Hinweis, welche Datensätze noch
keine Einzelergebnisse haben.

## Dateikonventionen im Versionsordner

| Datei | Erkennung | Inhalt |
|---|---|---|
| Summary | Dateiname enthält `summary` | eine Zeile pro Datensatz mit `score.<metrik>.avg` / `.n` |
| Runs | Dateiname enthält `runs` | eine Zeile pro Anruf mit `feedback.<metrik>`, `outputs.trajectory` und optional `assistant_turns`, `total_turns`, `avg_turn_duration` |

Die Dateinamen dürfen ansonsten frei bleiben; sowohl `summary.csv` als auch
`V1_summary.csv` funktionieren. Die Zuordnung Runs-Datei → Datensatz läuft über
die Spalte `experiment` der Summary-Datei, die im Runs-Dateinamen vorkommt.

Die Summary-Datei wird sofort geladen (Übersichtsseite), die Runs-Dateien erst
beim Öffnen einer Metrik-Verteilung oder der Kennzahl „Gesprächsdauer“.

Die Turn-Spalten sind optional: fehlen sie, bleiben die entsprechenden
Kennzahlen leer, alles andere funktioniert weiter.

## Neue Metriken und Datensätze benennen

Unbekannte Metriken und Datensätze werden automatisch übernommen: Namen werden
aus dem Spalten- bzw. Datensatznamen abgeleitet (inkl. Erkennung von
`cal`/`nocal`, `telonly`/`telemail`, `multiinfo`) und mit dem Hinweis versehen,
dass noch keine Beschreibung hinterlegt ist.

Für eine saubere Darstellung einen Eintrag in `assets/content.js` ergänzen:

- `METRICS` – lesbarer Name, Messverfahren, Zielrichtung (`hoch` / `niedrig` /
  `ziel` mit `target`), Skala, Bewertungsfrage, Beschreibung
- `DATASETS` – lesbarer Name, Szenario, Konfiguration, Beschreibung
- `SCENARIOS` – neues Call-Szenario samt `match()`-Funktion auf den Datensatznamen
- `KPI_MEASURES` – zusätzliche Kennzahl-Kachel in der Übersicht

### Metriken in einzelnen Konfigurationen ausnehmen

Manche Metriken werden mitgeschrieben, sind aber in bestimmten Konfigurationen
inhaltlich nicht auswertbar. Dafür gibt es `excludeIf` im Metrik-Eintrag:

```js
all_info_appointment_telemail: {
  // ohne Kalenderanbindung ist keine Terminbuchung möglich
  excludeIf: (dsName, info) => info.kalender === false,
}
```

Ausgenommene Kombinationen fliessen nirgends ein – weder in die Aggregation noch
in Verteilungen, Tabellen oder Beispielgespräche. Die Werte in den
Ergebnisdateien bleiben unverändert; sie werden nur nicht mitgerechnet.

## Kennzahlen-Aufschlüsselung

Die Kacheln in „Was in dieser Auswertung steckt“ sind anklickbar und öffnen die
Aufschlüsselung nach Szenario und Version – für Anrufe, Datensätze, Metriken,
Fehlerrate, Gesprächsdauer und Kosten. Bei „Gesprächsdauer“ kommen die
Turn-Kennzahlen aus den Runs-Dateien hinzu (Assistenz-Turns, Turns gesamt,
durchschnittliche Turn-Dauer), jeweils als Mittel je Szenario und als
gewichtetes Mittel über alle Szenarien.

## Entwicklungsmodus

`index.html?source=local` lädt `manifest.json` und die CSV-Dateien **relativ zur
Seite** statt aus GitHub. Praktisch, um neue Daten lokal zu prüfen, bevor sie
gepusht sind:

```bash
python3 scripts/build_manifest.py
python3 -m http.server 8791
```

Ohne den Parameter kommen die Daten immer aus dem GitHub-Repository.

## Versionsfarben

Die Palette wird in der sortierten Reihenfolge der Versionsordner vergeben (Farbe
folgt der Version, nicht der Auswahlreihenfolge). Sie ist über alle Paare auf
Farbfehlsichtigkeit geprüft:

| Position | Farbe | sipgate NeoColors | aktuell |
|---|---|---|---|
| 1 | `#315DFF` | Blue Key | V1 OpenAI |
| 2 | `#D14D00` | Orange 10 | V1 SipgateAI |
| 3 | `#0E9B6B` | Green 24 | – |
| 4 | `#AD90FF` | Violet 40 | – |
| 5 | `#DCA72B` | Amber 40 | – |

Maximal fünf Versionen sind gleichzeitig vergleichbar; weitere Versionen werden
neutral grau dargestellt und allein über Label und Legende unterschieden.

## manifest.json

`manifest.json` listet alle Versionsordner samt Dateien und Blob-SHAs. Das
Dashboard liest es über `raw.githubusercontent.com` – ohne API-Zugriffslimit und
auch in Netzen, die `api.github.com` blocken. Fehlt das Manifest, fällt das
Dashboard automatisch auf die GitHub-Contents-API zurück.

Der Workflow `.github/workflows/manifest.yml` aktualisiert das Manifest bei jedem
Push in einen Datenordner automatisch. Manuell:

```bash
python3 scripts/build_manifest.py
```

## Deployment auf Netlify

Netlify auf dieses Repository zeigen lassen:

- Branch: `main`
- Build command: _(leer)_
- Publish directory: `.`

`netlify.toml` enthält diese Einstellungen bereits. Das Repository muss öffentlich
bleiben, weil die Daten clientseitig ohne Token geladen werden.

## Hinweis zu den Daten

Alle Anrufe, Namen, Telefonnummern, E-Mail-Adressen und Kundennummern sind
synthetisch. Surfers Immobilien ist eine fiktive Wohnungsgenossenschaft, die als
Testumgebung dient.
