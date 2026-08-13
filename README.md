# Pre-Deploy Simulations Tests

Dashboard und Datenablage für die LangSmith-Simulationsexperimente der digitalen
Anruf-Assistentin von **Surfers Immobilien** (fiktive Wohnungsgenossenschaft,
Testumgebung).

Das Dashboard (`index.html`) ist eine einzelne, eigenständige HTML-Datei. Es lädt
die Ergebnisdaten **zur Laufzeit direkt aus diesem Repository** über die GitHub-API.
Neue Daten werden also allein durch einen Push in dieses Repo sichtbar – die
HTML-Datei muss dafür nicht erneut deployt werden.

## Ordnerstruktur

```
/
├── index.html          ← Dashboard (Netlify Publish Directory = Repo-Root)
├── netlify.toml
├── V1/                 ← eine Ordner pro Agenten-Version
│   ├── V1_summary.csv
│   └── V1_runs__<experiment>.csv
└── V2/                 ← zukünftige Version, einfach anlegen
    ├── V2_summary.csv
    └── V2_runs__<experiment>.csv
```

**Die Version wird ausschließlich aus dem Ordnernamen gelesen.** Jeder Ordner im
Repo-Root, dessen Name dem Muster `V<Zahl>` entspricht (`V1`, `V2`, `V10`,
optional mit Suffix wie `V2-hotfix`), wird automatisch als Version erkannt und im
Dashboard als auswählbare Version angeboten – inklusive eigener Farbcodierung für
A/B-Vergleiche.

## Dateikonventionen innerhalb eines Versionsordners

| Datei | Erkennung | Inhalt |
|---|---|---|
| Summary | Dateiname enthält `summary` | eine Zeile pro Datensatz mit `score.<metrik>.avg` / `.n` |
| Runs | Dateiname enthält `runs` | eine Zeile pro Simulationsanruf mit `feedback.<metrik>` und `outputs.trajectory` |

Die Dateinamen dürfen ansonsten frei bleiben (das LangSmith-Export-Schema
`V1_runs__<experiment-name>.csv` funktioniert unverändert). Die Zuordnung
Runs-Datei → Datensatz erfolgt über die Spalte `experiment` in der Summary-Datei,
die im Runs-Dateinamen enthalten ist.

## Neue Version hinzufügen

1. Ordner `V2/` anlegen.
2. Summary-CSV und Runs-CSVs des LangSmith-Exports hineinlegen.
3. Commit + Push.
4. Dashboard neu laden – `V2` erscheint als Version und kann mit `V1` verglichen werden.

## Deployment

Netlify auf dieses Repo zeigen lassen:

- Build command: _(leer)_
- Publish directory: `.`

Die Daten werden clientseitig über `api.github.com` (Verzeichnislisting) und
`raw.githubusercontent.com` (Dateiinhalte) geladen. Deshalb muss dieses Repo
öffentlich sein. Ein Cache-Busting-Parameter auf Basis des Git-SHA sorgt dafür,
dass Änderungen sofort sichtbar sind.
