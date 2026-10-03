# Genuss-Radeln

Testversion einer Fahrradrouten-Web-App für Menschen ab ca. 50 Jahren: Wunsch angeben,
drei schöne Touren am Niederrhein vorgeschlagen bekommen, losfahren.

- Anforderungen: [docs/lastenheft.md](docs/lastenheft.md)
- Regeln und Technik: [CLAUDE.md](CLAUDE.md)

## Lokal starten

```sh
npm install
npm run dev
```

Dann im Browser <http://localhost:5173> öffnen.

## Veröffentlichen

Jeder Push auf `main` baut die App und veröffentlicht sie auf GitHub Pages
(`.github/workflows/deploy.yml`).
