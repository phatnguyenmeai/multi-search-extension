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
- **Search the selection** — select text on the page first, then open the bar
  (`Ctrl+F`, `Ctrl+Shift+F`, or the toolbar button) and the first term is
  pre-filled with your selection — including selections inside iframes.
- **Per-term colors** — pick any highlight color for each term with a color
  picker. A configurable 8-color palette supplies defaults for new terms.
- **Match navigation** — jump between matches with the ▲ / ▼ buttons or
  `Enter` / `Shift+Enter`; a live counter shows your position.
- **Match case** and **whole word** toggles.
- **Per-term match counts** shown next to each term.
- Enable/disable individual terms without deleting them.
- **Searches everywhere on the page** — the main document, **open Shadow DOM**
  (web components), and **iframes**, including **cross-origin** ones.
  Navigation steps through matches across every frame.
- Remembers your terms, options, and palette between sessions.

## Usage

1. Open any web page and press **`Ctrl+F`** (or **`Ctrl+Shift+F`**, or click
   the toolbar icon → *Open search bar*). If you select text on the page first,
   it's used to pre-fill the first search term.
2. Type a term — results update as you type (with a short 300 ms debounce).
   Click **+ Add search term** — or press **`Ctrl+=`** — for more.
3. Click the color swatch on a row to change that term's highlight color.
4. Navigate matches with ▲ / ▼ or `Enter` / `Shift+Enter`. Press `Esc` to close.

The toolbar popup lets you edit the default color palette and toggle whether
`Ctrl+F` is intercepted.

## Build

All the application code is shared between browsers — only `manifest.json`
differs. The build script combines `core/` with a browser's manifest into a
ready-to-load folder under `dist/`.

**macOS / Linux** (`build.sh`):

```sh
./build.sh            # build chrome, edge and firefox
./build.sh firefox    # build only the named browser(s)
```

**Windows** (`build.ps1`, PowerShell):

```powershell
.\build.ps1            # build chrome, edge and firefox
.\build.ps1 firefox    # build only the named browser(s)
```

> If PowerShell blocks the script, run it once as
> `powershell -ExecutionPolicy Bypass -File .\build.ps1`.

Each run produces `dist/chrome/`, `dist/edge/` and/or `dist/firefox/`.

## Install (developer / unpacked)

Run `./build.sh` first, then load the matching `dist/` folder.

### Chrome / Edge
1. Go to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `dist/chrome` (or `dist/edge`).

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.

> Note: browsers cannot run extensions on internal pages (`chrome://`,
> `about:`, the add-on store, etc.).

## Project layout

The source is split into shared code and per-browser manifests:

```
core/        Shared code — identical for every browser
chrome/      Chrome-only manifest.json
edge/        Edge-only manifest.json
firefox/     Firefox-only manifest.json
build.sh     Assembles dist/<browser>/ from core/ + a manifest (macOS/Linux)
build.ps1    Same, for Windows PowerShell
dist/        Build output (git-ignored, loadable folders)
```

### `core/` — shared across all browsers

| File | Purpose |
|------|---------|
| `core/content.js` | Runs in every frame: search bar (top frame), `Ctrl+F` interception, Shadow-DOM-aware highlighting. |
| `core/content.css` | Styles for the search bar and highlights. |
| `core/background.js` | Background script — keyboard command + cross-frame message routing. |
| `core/popup.html` / `core/popup.js` | Toolbar popup: launcher, palette editor, settings. |
| `core/icons/` | Generated PNG icons. |
| `core/gen_icons.py` | Regenerates the icons (`python3 core/gen_icons.py`). |

### Per-browser manifests

`manifest.json` is the only file that varies between browsers:

- **`chrome/`** and **`edge/`** — Chromium-based; identical Manifest V3 with a
  `background.service_worker`.
- **`firefox/`** — uses `background.scripts` (Firefox MV3 has no service
  worker) and adds the `browser_specific_settings.gecko` block.

## Continuous delivery (Jenkins)

The included `Jenkinsfile` builds all three packages and submits each to its
store. It validates the JS/manifests, runs `build.sh`, zips
`dist/<browser>-<version>.zip`, then publishes. Publishing runs automatically
on the `main` branch and on tag builds; other branches build + package only.
The `DRY_RUN` and `PUBLISH_*` build parameters let you skip submission.

Before the first publish:

1. Edit the store IDs in the `environment` block of the `Jenkinsfile`
   (`CHROME_EXTENSION_ID`, `EDGE_PRODUCT_ID`; `FIREFOX_ADDON_ID` is preset).
2. Add these Jenkins **Secret text** credentials:

   | Store | Credential IDs |
   |-------|----------------|
   | Chrome Web Store | `cws-client-id`, `cws-client-secret`, `cws-refresh-token` |
   | Edge Add-ons | `edge-api-key`, `edge-client-id` |
   | Firefox AMO | `amo-jwt-issuer`, `amo-jwt-secret` |

The Jenkins agent needs `bash`, `zip`, `curl`, `jq` and Node.js 18+. Store
submission uses `chrome-webstore-upload-cli`, the Edge Add-ons API v1.1, and
`web-ext sign` (all run via `npx`, no global installs).

## Known limitations

- **Closed** Shadow DOM cannot be accessed by any extension and is skipped.
- Sandboxed iframes without `allow-scripts` can't run the highlighter.
- When navigating into a match inside a cross-origin iframe, the iframe
  scrolls its own content into view, but it can't scroll the parent page —
  so the match is visible only if the iframe itself is already on screen.

## License

See [LICENSE](LICENSE).
