# Azkan

A card grid section — 4 soft, light cards with a live-preview dev setup.

## View the UI live (auto-reload on save)

```bash
node dev-server.mjs
```

Then open **http://localhost:3000**. Edit `index.html` or `styles.css`, save,
and the page reloads automatically.

## Other quick options

- **Just open the file:** double-click `index.html` (no auto-reload).
- **Python one-liner:** `python3 -m http.server 3000` then open
  http://localhost:3000 (no auto-reload; refresh manually).
- **VS Code:** install the "Live Server" extension and click *Go Live*.

## Files

- `index.html` — markup for the card grid section
- `styles.css` — all styling
- `dev-server.mjs` — zero-dependency live-reload server
