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
- **Keep-awake switch** — uses the OS power-save blocker to prevent sleep while a task is running, with a “Mark task finished” button to release it

Readings refresh every two seconds. All telemetry is collected locally; Stellaview has no cloud services.

> **Keep-awake note:** The lock is active only while Stellaview is running. Closing the app releases it automatically. It is not restored on the next launch, so your computer cannot be left awake indefinitely by accident.

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

### Linux

```bash
npm run dist:linux
```

- `Stellaview-1.0.0-x86_64.AppImage` — portable standalone app
- `stellaview_1.0.0_amd64.deb` — Debian/Ubuntu package

The `.deb` installs a desktop shortcut with `Terminal=false`, so Stellaview launches as a normal GUI application.

### Windows

```bash
npm run dist:win
```

- `Stellaview-Setup-1.0.0.exe` — NSIS installer with desktop and Start menu shortcuts
- `Stellaview-1.0.0-win-x64.zip` — portable zip

On Linux, the NSIS step needs Wine. Use `npm run dist:win:zip` to produce just the portable zip without Wine; GitHub's Windows runner builds the installer natively.

### macOS

```bash
npm run dist:mac
```

- `Stellaview-1.0.0-mac-universal.dmg` — universal Apple Silicon + Intel DMG
- `Stellaview-1.0.0-mac-universal.zip` — portable zip

macOS packages can only be built on macOS. The release workflow uses a GitHub macOS runner. These builds are unsigned, so macOS may ask you to right-click and choose **Open** the first time. Add an Apple Developer certificate to `mac.identity` and notarization if you need a fully signed app.

Icons are derived from your logo: `build/icon.png` (Linux), `build/icon.ico` (Windows), and `build/icon.icns` (macOS).

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
build/icon.png    Linux window/desktop icon
build/icon.ico    Windows window/taskbar/installer icon
build/icon.icns   macOS app/dock icon
```

## Replacing the logo

Replace `public/logo.png` with a square PNG of your logo. Then regenerate the platform icons from it:

```bash
python3 - <<'PY'
from PIL import Image
img = Image.open('public/logo.png').convert('RGBA')
img.save('build/icon.png', 'PNG', optimize=True)
img.save('build/icon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
img.save('build/icon.icns', format='ICNS')
PY
```

The UI picks up `public/logo.png` without any code changes.


## Publishing to GitHub

The repository is ready to push. After creating an empty repository on GitHub:

```bash
git remote add origin https://github.com/<your-username>/Stellaview.git
git branch -M main
git push -u origin main
```

Pushing a tag such as `v1.0.0` triggers the release workflow, which builds the Linux, Windows, and macOS installers on their native runners and attaches all of them to a GitHub Release:

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
| `.github/workflows/ci.yml` | Typecheck, build, and smoke test on Linux, Windows, and macOS |
| `.github/workflows/release.yml` | Builds Linux, Windows, and macOS installers for `v*` tags |
| `.github/ISSUE_TEMPLATE/` | Bug report and feature request forms |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist |

## Contributing

See `CONTRIBUTING.md` for setup and contribution guidelines.

## Security

Stellaview is local-only by design. See `SECURITY.md` for the security policy and how to report vulnerabilities privately.

## License

MIT © 2026 Stellaview. See `LICENSE` for details.
