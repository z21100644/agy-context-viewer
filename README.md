# Antigravity Minimalist Context Viewer

**English** | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

A lightweight, 100% local, zero-dependency context window & generation speed monitor for Google Antigravity 2.x — supporting **English**, **Simplified Chinese (简体中文)**, and **Traditional Chinese (繁體中文)**.

## Key Features

- **Adaptive Topbar Capsule**: Combines a live occupancy ring, tabular percentage, and streaming generation rate in a single pill (`wide` / `compact` / `ring-only` hysteresis collapse; automatically hides idle speed placeholders).
- **Multi-Language UI & CLI (`en` / `zh-CN` / `zh-TW`)**: Automatically follows your IDE / system locale (defaulting to English for other locales), with an instant one-click `EN` / `简` / `繁` switcher in the panel header persisted in `localStorage`, plus `--lang` CLI support.
- **Core Capacity & High-Occupancy Alerts**: Displays real-time context occupancy, cache read / fresh input / model output breakdown, and remaining tokens; surfaces a concise single-line alert with a `/compact` command chip at `>= 90%` occupancy or on request errors.
- **4-Column Generation Telemetry & Speed Tiers**: Side-by-side **Speed** (end-to-end including TTFT, graded as `Fast` `>=60`, `Smooth` `>=25`, `Fair` `>=10`, `Slow` `<10 tok/s`; hover to inspect pure streaming rate and TTFT share), **TTFT**, **Duration**, and **Output**.
- **Active Context Breakdown Drawer**: On-demand stacked bar and category shares converging to `100%` (System Prompt & Tools, Tool Calls & Outputs, Model Responses, Thinking Process, User Messages, Compacted Summaries, Attachments), automatically scoped from the most recent `/compact` checkpoint.
- **100% Local & Zero Telemetry**: Strictly read-only against local `127.0.0.1` endpoints — zero external network requests, zero update checks, zero background disk ledgers; automatically follows IDE light/dark theme with manual override.

---

## Quick Install & Restore

### Option 1: One-Click Scripts (Recommended)
1. Extract the entire ZIP archive to any folder.
2. **Windows**: Double-click `install.bat` to persistently patch `app.asar` and hot-mount into open windows (no need to close or restart Antigravity; if Node.js is not installed globally, the script automatically borrows Antigravity's bundled runtime). Double-click `uninstall.bat` to restore.
3. **macOS / Linux**: Run `./install.sh` to install, or `./uninstall.sh` to restore.

### Option 2: CLI Management
Requirements: Node.js `>= 22.4.0` (zero `npm install` third-party dependencies; Python is optional and only used for deep PDF/Office attachment parsing — plain text and images are parsed natively in Node.js).

```bash
# 1. Environment preflight check (auto-detects locale, or pass --lang en|zh-CN|zh-TW)
node cli.js check

# 2. Persistently patch app.asar & hot-mount into active windows (no restart needed)
node cli.js install

# 3. Inspect installation & live window status (JSON)
node cli.js status

# 4. Diskless CDP hot-mount into active window only
node cli.js live

# 5. Losslessly restore verified original app.asar backup
node cli.js restore
```

> **Tip**: After an Antigravity client update overwrites `app.asar`, simply re-run `install.bat` or `node cli.js install` to re-mount.

---

## Development & Packaging

Frontend source files live in `src/renderer/` (`template.html`, `styles.css`, `main.js`). Do not edit the generated `meter-renderer.js` directly:

```bash
# Compile single-file Shadow DOM renderer bundle
npm run build:renderer

# Run unit & integration tests
npm test

# Build cross-platform release ZIP archives
npm run package
```

## File Structure

```text
antigravity-context-viewer/
├── src/renderer/              # Frontend UI source (template.html / styles.css / main.js)
├── scripts/                   # Zero-dependency renderer bundler & PKZIP release builder
├── meter-core.js              # Context stats, speed tiers, share convergence, error & i18n core
├── meter-collector.js         # Read-only local trajectory & native image/text scanner
├── meter-main.js              # Electron main-process window mount & narrow read-only IPC
├── meter-renderer.js          # Compiled single-file Shadow DOM renderer bundle
├── install.js / restore.js    # SHA-256 verified ASAR patcher & lossless restorer
├── asar-engine.js             # Pure Node.js ASAR archive engine
├── install.bat / uninstall.bat# Windows one-click install & restore scripts
└── cli.js                     # Multi-language command-line lifecycle manager
```
