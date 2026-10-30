# Releases and packaging

## Versioning

- **dizzy9 RobinEdit 0.4.4** — original Windows tool ([romhacking.net/utilities/1828](https://www.romhacking.net/utilities/1828/)); archives in [`upstream/`](../upstream/).
- **This React app** — separate line. First milestone release: **v0.5.0** (“React port of RobinEdit 0.4.4”). Ongoing work continues on the next minor (`package.json`).

## Do we build in GitHub Actions?

Yes, optionally. Workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs `npm ci && npm run build` on `v*` tags and attaches a `robinedit-<tag>-dist.tar.gz` to the GitHub Release (and as a workflow artifact).

Locally: `make build` → `dist/` (static Vite SPA; host anywhere or open via a static server).

## Multiplatform executable?

React itself is a **web** UI (browser / static hosting). To ship a native-ish **exe** for Windows / Mac / Linux you wrap the same app:

| Option | Notes |
|--------|--------|
| **Tauri** (recommended later) | Small Rust shell + system WebView; lighter than Electron |
| **Electron** | Chromium + Node; larger downloads, very common |
| **PWA** | Installable from the browser; no separate “exe” packaging |
| **Capacitor** | More mobile-oriented; can also target desktop |

Not required for the current Vite editor. Track desktop packaging separately if/when you want offline Win/Mac/Linux binaries.
