# Stellaview

A standalone Linux desktop dashboard for live system information. Built with **Next.js** (static export) inside an **Electron** window, so it behaves like a normal app — no browser address bar and no terminal required after install.

Your logo is used as the app icon, the window/taskbar icon, the sidebar brand mark, the title-bar mark, the hero watermark, and the footer mark. The navy/indigo/cyan theme colors were sampled from the logo image itself.

## What it shows

- **Processor** — model, logical threads, speed, live usage, load average
- **Memory** — used/total, available, swap usage
- **Network & downloads** — live download/upload throughput, total received/sent, per-interface IP/MAC and speeds
- **Storage** — used/free space for mounted volumes
- **Thermal & fans** — temperature sensors and fan RPM where the hardware exposes them
- **Hardware** — GPU, motherboard, BIOS, kernel, architecture, display, battery
- **Processes** — top CPU consumers

Readings refresh every two seconds. All telemetry is collected locally; Stellaview has no cloud services.

> **Fan speed note:** Many Mini PCs and laptops do not expose fan RPM to Linux (`/sys/class/hwmon`). When that happens, Stellaview shows a clear "not exposed by hardware" message instead of inventing a value.

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts Next.js on port 3000 and opens the Electron window pointing at it.

## Production build

```bash
npm run build     # exports the Next.js app to out/
npm start         # opens the exported app in Electron
```

## Standalone installers / desktop shortcut

```bash
npm run dist:linux
```

This produces installers in `dist/`:

- `Stellaview-1.0.0-x86_64.AppImage` — portable standalone app
- `stellaview_1.0.0_amd64.deb` — Debian/Ubuntu package

The `.deb` installs a desktop shortcut with `Terminal=false`, so Stellaview launches as a normal GUI application. The AppImage can be made permanent with a launcher such as AppImageLauncher, or by creating a `.desktop` entry pointing at it.

The icon used for both the window and desktop shortcut is `build/icon.png` (converted from your logo to a true PNG).

## Project layout

```
app/              Next.js UI (App Router)
components/       Dashboard, charts and gauges
lib/              Shared types and formatting helpers
electron/
  main.cjs        Electron window, IPC, embedded local static server
  preload.cjs     Safe bridge between UI and system APIs
  system.cjs      OS telemetry collectors
  server.cjs      Tiny local HTTP server for the static export
public/logo.png   Your logo, served to the UI
build/icon.png    Your logo as the desktop/window icon
```

## Replacing the logo

Replace `public/logo.png` and `build/icon.png` with a square PNG of your logo, then rebuild. The UI will pick it up from `public/logo.png` without any code changes.

## Publishing to GitHub

The repository is ready to push. After creating an empty repository on GitHub:

```bash
git remote add origin https://github.com/<your-username>/Stellaview.git
git branch -M main
git push -u origin main
```

Pushing a tag such as `v1.0.0` triggers the release workflow, which builds the AppImage and `.deb` and attaches them to a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Repository files

| File | Purpose |
| --- | --- |
| `LICENSE` | MIT license |
| `CONTRIBUTING.md` | Development and PR guidelines |
| `SECURITY.md` | Security policy and private reporting |
| `.gitignore` | Keeps dependencies and build artifacts out of git |
| `.gitattributes` | Consistent line endings and binary handling for the logo |
| `.github/workflows/ci.yml` | Typecheck, build, and smoke test on pushes/PRs |
| `.github/workflows/release.yml` | Builds and publishes installers for `v*` tags |
| `.github/ISSUE_TEMPLATE/` | Bug report and feature request forms |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist |

## Contributing

See `CONTRIBUTING.md` for setup and contribution guidelines.

## Security

Stellaview is local-only by design. See `SECURITY.md` for the security policy and how to report vulnerabilities privately.

## License

MIT © 2026 Stellaview. See `LICENSE` for details.
