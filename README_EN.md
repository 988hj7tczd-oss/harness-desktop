# harness-desktop — Colorful desktop client for DeepSeek Harness

> **Download, install, double-click, and chat** — no terminal, no environment setup.
> The official DeepSeek Harness Web UI, wrapped in a native desktop shell for macOS, Windows, and Linux.

[中文 README](README.md)

## Colorful appearance · make it yours

Paint this workbench your way: **dark / light / follow-system** themes × **DeepSeek blue / green / purple / orange** accent colors, plus **font size** and **message density** — all applied live and persisted across restarts, so every day of Harness gets its own look.

![splash](assets/screenshots/splash.png)

## Screenshots

**Splash (startup)**

![splash](assets/screenshots/splash.png)

**Main UI (official DeepSeek Harness Web UI integrated, with brand)**

![main](assets/screenshots/main.png)

## Features

- **Out-of-the-box**: built-in DeepSeek Harness engine — install and chat. First-run wizard gets you started in 3 minutes
- **Official UI, deeply integrated**: the window loads the engine's own Web UI (same-origin, not an iframe) — chat, sessions, trajectory, and settings are all the official experience
- **Streaming chat**: typewriter output + thinking visualization
- **Task panel**: task tracking / auto-review / failure retry
- **Agent evolution**: memory auto-persists (preferences / project conventions / success patterns) + skills auto-distilled from repeated tasks
- **Security**: strict CSP / single-instance lock / attachment limits / safeStorage-encrypted credentials
- **Appearance (colorful & customizable)**: dark / light / follow-system themes × DeepSeek blue / green / purple / orange accents, font size / message density, applied live
- **System tray**: minimize to tray and keep running in background
- **3 platforms, native builds**: GitHub Actions matrix builds each platform on its own native runner

## Install

### npm (one command, auto-downloads platform installer)

```bash
npm install -g harness-desktop
# npm may block install scripts by default; use this to auto-download:
npm install -g --allow-scripts=harness-desktop harness-desktop

# Launch the installer
harness-desktop

# Check download status
harness-desktop --check
```

### Homebrew (macOS)

```bash
brew tap 988hj7tczd-oss/harness-desktop
brew install harness-desktop
```

### Direct download

| Platform | Installer |
|---|---|
| macOS Apple Silicon | [harness-desktop-0.1.0-arm64.dmg](https://github.com/988hj7tczd-oss/harness-desktop/releases/download/v0.1.1/harness-desktop-0.1.0-arm64.dmg) |
| macOS Intel | [harness-desktop-0.1.0.dmg](https://github.com/988hj7tczd-oss/harness-desktop/releases/download/v0.1.1/harness-desktop-0.1.0.dmg) |
| Windows x64 | [harness-desktop.Setup.0.1.0.exe](https://github.com/988hj7tczd-oss/harness-desktop/releases/download/v0.1.1/harness-desktop.Setup.0.1.0.exe) |
| Linux x64 | [harness-desktop-0.1.0.AppImage](https://github.com/988hj7tczd-oss/harness-desktop/releases/download/v0.1.1/harness-desktop-0.1.0.AppImage) / [.deb](https://github.com/988hj7tczd-oss/harness-desktop/releases/download/v0.1.1/harness-desktop_0.1.0_amd64.deb) |

**China mirror (Gitee)**: https://gitee.com/jerryweizhihao/harness-desktop

### First run

Run → 4-step wizard (welcome → API Key → workspace → done) → start chatting.

Get your API Key at [platform.deepseek.com](https://platform.deepseek.com/api_keys).

> No installer? Run from source:
> ```bash
> pnpm install
> pnpm dev
> ```

## Development

```bash
pnpm install      # install dependencies
pnpm dev          # dev mode: vite + electron (HMR)
pnpm build        # build renderer + main
pnpm test         # run unit tests (Vitest)
pnpm typecheck    # TS type check
pnpm dist         # package macOS dmg + Windows exe (output to out/)
pnpm dist:mac     # macOS only
pnpm dist:win     # Windows only
```

macOS signing & notarization: [docs/SIGNING.md](docs/SIGNING.md)

## Tech Stack

- **Engine**: DeepSeek Harness `@deepseek-ai/dsh@0.1.0-rc.6` (pinned)
- **Shell**: Electron 43 + electron-builder
- **Frontend**: React 18 + TypeScript + Vite (hand-written CSS + `--dsw-*` tokens, no heavy UI libs)
- **Isolation layer**: `adapter/` encapsulates the dsh API — upstream changes only touch the adapter, the renderer never sees raw dsh fields

## DSH Ecosystem

- 📦 [awesome-dsh-plugin](https://github.com/988hj7tczd-oss/awesome-dsh-plugin) — curated list of DeepSeek Harness plugins (this project is featured under "Desktop Clients")
- 🖱️ [dsh-computer-use](https://github.com/988hj7tczd-oss/dsh-computer-use) — Computer Use plugin: gives harness-desktop human-like virtual mouse control
- 🌐 Website: [aibunkhouse.com](https://aibunkhouse.com) · Tools: [aibunkhouse.com/tools](https://aibunkhouse.com/tools)

## Known Limitations

- **Unsigned**: current builds are not code-signed/notarized — installers may show "unidentified developer" warnings; see [docs/SIGNING.md](docs/SIGNING.md)
- **Size**: installers ~130-230MB (bundled dsh engine + Electron)
- **3 platforms**: macOS / Windows / Linux built natively via GitHub Actions matrix; Windows verified on real hardware
- **dsh engine**: preview (rc), pinned to `0.1.0-rc.6`

## License

[MIT](LICENSE)

---

*Not an official DeepSeek product, not affiliated with DeepSeek; DeepSeek Harness is an open-source project by [DeepSeek AI](https://deepseek.com).*
