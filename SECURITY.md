# Security Policy

## Local-only by design

Stellaview reads system information locally through Node.js and Linux `/proc` and `/sys` interfaces. It does not transmit telemetry, and it has no cloud service dependency.

The Electron renderer runs with `contextIsolation` enabled and `nodeIntegration` disabled. The preload script exposes only a small, explicit API for snapshots and window controls.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository, or contact the maintainer privately.

Include:

- affected version
- reproduction steps
- potential impact
- suggested fix, if you have one

You should receive an acknowledgement within a few days.
