# Security policy

## What SWVA Traffic Watch is (and is not)

SWVA Traffic Watch is a **local** browser viewer for Southwest Virginia **VDOT / 511** traffic cameras (static files + a tiny localhost server that proxies the public camera list).

It is **not**:
- an official VDOT or 511 Virginia product
- a commercial traffic service
- a cloud app that stores your viewing history for the publisher
- something that uses the publisher’s paid API keys

## Trust checklist for users

1. Prefer downloading from this GitHub repository (or a Release you trust).
2. Run via `start.bat` (or `serve.py` / `serve.ps1`) on `http://127.0.0.1:8766`.
3. Keep the Command Prompt / terminal open while using the app.
4. Review `serve.py` / `serve.ps1` if you want to see exactly what the cams proxy does.
5. Optional Cash App tips are unrelated to runtime; the app does not phone home for payments.

## Reporting a vulnerability

Please **do not** open a public issue for security bugs.

Use GitHub’s **private vulnerability reporting** on this repository (Security tab → Report a vulnerability), or contact the maintainer via their GitHub profile if private reporting is unavailable.

Include affected commit, steps, and impact (e.g. proxy issues, unexpected bind beyond localhost).

## Supported versions

Only the latest `main` branch is supported for security fixes.
