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
├── V1/                     ← ein Ordner pro Agenten-Version
│   ├── V1_summary.csv
│   └── V1_runs__<experiment>.csv
└── V2/                     ← zukünftige Version, einfach anlegen
```

## Neue Ergebnisse hinzufügen

**Gleiche Version, aktualisierte Daten:** Datei im Versionsordner ersetzen,
committen, pushen. Fertig – beim nächsten Laden zeigt das Dashboard die neuen
Werte. (Ein Cache-Buster auf Basis des Git-SHA verhindert veraltete Ansichten.)

**Neue Version:**

1. Ordner `V2/` anlegen.
2. Summary-CSV und Runs-CSVs des LangSmith-Exports hineinlegen.
3. Committen und pushen.
4. Dashboard neu laden – `V2` erscheint als Version und lässt sich mit `V1`
   vergleichen (Mehrfachauswahl in der Filterzeile).

Die Version wird **ausschliesslich aus dem Ordnernamen** gelesen. Jeder Ordner im
Repo-Root, dessen Name auf `V<Zahl>` passt (`V1`, `V2`, `V10`, auch mit Suffix wie
`V2-hotfix`), gilt als Version.

## Dateikonventionen im Versionsordner

| Datei | Erkennung | Inhalt |
|---|---|---|
| Summary | Dateiname enthält `summary` | eine Zeile pro Datensatz mit `score.<metrik>.avg` / `.n` |
| Runs | Dateiname enthält `runs` | eine Zeile pro Anruf mit `feedback.<metrik>` und `outputs.trajectory` |

Die Dateinamen dürfen ansonsten frei bleiben; das LangSmith-Export-Schema
`V1_runs__<experiment>.csv` funktioniert unverändert. Die Zuordnung
Runs-Datei → Datensatz läuft über die Spalte `experiment` der Summary-Datei, die
im Runs-Dateinamen vorkommt.

Die Summary-Datei wird sofort geladen (Übersichtsseite), die Runs-Dateien erst
beim Öffnen einer Metrik-Verteilung.

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

## Versionsfarben

Feste Zuordnung (Farbe folgt der Version, nicht der Auswahlreihenfolge), geprüft
auf Farbfehlsichtigkeit über alle Paare:

| Version | Farbe | sipgate NeoColors |
|---|---|---|
| V1 | `#315DFF` | Blue Key |
| V2 | `#D14D00` | Orange 10 |
| V3 | `#0E9B6B` | Green 24 |
| V4 | `#AD90FF` | Violet 40 |
| V5 | `#DCA72B` | Amber 40 |

Maximal fünf Versionen sind gleichzeitig vergleichbar; weitere Versionen werden
neutral grau dargestellt und allein über Label und Legende unterschieden.

## manifest.json

`manifest.json` listet alle Versionsordner samt Dateien und Blob-SHAs. Das
Dashboard liest es über `raw.githubusercontent.com` – ohne API-Zugriffslimit und
auch in Netzen, die `api.github.com` blocken. Fehlt das Manifest, fällt das
Dashboard automatisch auf die GitHub-Contents-API zurück.

Der Workflow `.github/workflows/manifest.yml` aktualisiert das Manifest bei jedem
Push auf `V*/**` automatisch. Manuell:

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
