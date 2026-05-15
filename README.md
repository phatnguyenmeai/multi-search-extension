# Multi Search — Multi-term Find & Highlight

A browser extension that **replaces the built-in `Ctrl+F`** with a search bar
that finds **multiple terms at once** and highlights each one in its own
**configurable color**.

Works on **Chrome**, **Microsoft Edge**, and **Firefox** (Manifest V3).

## Features

- **Replaces `Ctrl+F`** — press it on any page to open the Multi Search bar
  instead of the browser's single-term find (can be turned off in the popup).
- **Multiple search terms** — add as many terms as you like; every term is
  searched and highlighted simultaneously.
- **Per-term colors** — pick any highlight color for each term with a color
  picker. A configurable 8-color palette supplies defaults for new terms.
- **Match navigation** — jump between matches with the ▲ / ▼ buttons or
  `Enter` / `Shift+Enter`; a live counter shows your position.
- **Match case** and **whole word** toggles.
- **Per-term match counts** shown next to each term.
- Enable/disable individual terms without deleting them.
- Remembers your terms, options, and palette between sessions.

## Usage

1. Open any web page and press **`Ctrl+F`** (or **`Ctrl+Shift+F`**, or click
   the toolbar icon → *Open search bar*).
2. Type a term. Click **+ Add search term** for more.
3. Click the color swatch on a row to change that term's highlight color.
4. Navigate matches with ▲ / ▼ or `Enter` / `Shift+Enter`. Press `Esc` to close.

The toolbar popup lets you edit the default color palette and toggle whether
`Ctrl+F` is intercepted.

## Install (developer / unpacked)

### Chrome / Edge
1. Go to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.

> Note: browsers cannot run extensions on internal pages (`chrome://`,
> `about:`, the add-on store, etc.).

## Project layout

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 definition (Chrome/Edge/Firefox). |
| `content.js` | Injects the search bar, intercepts `Ctrl+F`, highlights matches. |
| `content.css` | Styles for the search bar and highlights. |
| `background.js` | Service worker — routes the keyboard command to the page. |
| `popup.html` / `popup.js` | Toolbar popup: launcher, palette editor, settings. |
| `icons/` | Generated PNG icons. |
| `gen_icons.py` | Regenerates the icons (`python3 gen_icons.py`). |

## License

See [LICENSE](LICENSE).
