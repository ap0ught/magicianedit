# Releases and packaging

## Attribution

- **React port:** [Christopher Mayfield](https://github.com/ap0ught) / **ap0ught** (`cdm@ap0.org`)
- **Upstream Windows RobinEdit:** Łukasz Kur / **dizzy9** ([romhacking.net/utilities/1828](https://www.romhacking.net/utilities/1828/))

## Versioning

- **dizzy9 RobinEdit 0.4.4** — original Windows tool; archives in [`upstream/`](../upstream/). The About dialog still credits that tool. It is not this package’s version.
- **RobinEdit React line** — stays on [ap0ught/robinedit](https://github.com/ap0ught/robinedit). This repo was cloned from that line at **0.6.1**.
- **MagicianEdit** — new package line. `package.json` `name` is `magicianedit`. Version is reset to **0.1.0** so it is not a continuation of RobinEdit 0.6.x. The header badge tracks that baseline.

Desktop packaging (Tauri / Electron) is out of scope for the scaffold. RobinEdit tracked it as [robinedit issue #2](https://github.com/ap0ught/robinedit/issues/2).

## Do we build in GitHub Actions?

Yes, optionally. Workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs `npm ci && npm run build` on `v*` tags and attaches a `magicianedit-<tag>-dist.tar.gz` to the GitHub Release (and as a workflow artifact). The archive does not contain `.nes` carts.

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
