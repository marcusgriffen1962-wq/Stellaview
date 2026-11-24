# Contributing to Stellaview

Thanks for taking the time to contribute.

## Getting set up

```bash
git clone <your-fork-url>
cd Stellaview
npm install
npm run dev
```

`npm run dev` starts Next.js on port 3000 and opens the Electron window. To test the packaged experience instead:

```bash
npm run build
npm start
```

## Before opening a pull request

Run the same checks CI runs:

```bash
npm run typecheck
npm run build
```

CI runs these on Linux, Windows, and macOS. If you change packaging, also test the platform you can access locally. macOS installers can only be built on macOS; `npm run dist:win:zip` builds the Windows zip from Linux without needing Wine.

If you changed system telemetry, verify it against a real machine:

```bash
node -e "console.log(require('./electron/system.cjs').createSnapshot())"
```

## Where things live

- `app/` — Next.js pages and global styles
- `components/` — Dashboard UI, charts, and gauges
- `lib/` — shared types and formatting helpers
- `electron/main.cjs` — app lifecycle, IPC, embedded static server
- `electron/system.cjs` — OS telemetry collectors

## Guidelines

- Keep telemetry local and read-only. Stellaview should never send system data anywhere.
- Gracefully handle missing hardware sensors instead of showing fabricated numbers.
- Keep the visual language consistent with the logo-derived navy/indigo/cyan palette.
- Use small, focused commits and describe the user-visible effect in the PR.

## Reporting bugs

Use the bug report issue template and include your distribution, Stellaview version, and steps to reproduce.
