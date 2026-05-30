# Study Pulse — Mobile (Capacitor)

Study Pulse is a no-build static web app. We wrap it for iOS/Android with
[Capacitor](https://capacitorjs.com/), which loads the same HTML/CSS/JS inside a
native WebView and talks to the same Supabase backend. No rewrite, one codebase.

- **Capacitor version:** 7.6.5 (pinned for Node 21 compatibility — see _Node_ below)
- **App ID:** `com.studypulse.app`
- **App name:** Study Pulse
- **Web dir:** `www/` (generated — see _How the web assets get in_)

## TL;DR workflow

```bash
npm run sync            # stage web assets into www/ AND copy them into the native projects
npm run open:android    # open the Android project in Android Studio
npm run open:ios        # open the iOS project in Xcode (after iOS is added — see below)
```

Any time you edit `index.html`, `app.js`, `styles.css`, etc. at the repo root,
run `npm run sync` to push those changes into the native shells, then rebuild in
Android Studio / Xcode.

## How the web assets get in

This app has **no build step** — the files at the repo root _are_ the web app.
Capacitor needs a clean `webDir` though (it must not contain `node_modules/`,
`.git/`, or the native folders), so we stage the deployable files into `www/`:

- `scripts/copy-web.mjs` copies an explicit allow-list of files into `www/`.
- `npm run copy:web` runs that script.
- `npm run sync` runs `copy:web` and then `cap sync` (which copies `www/` into
  each native project and updates plugins).

`www/` is `.gitignore`d because it is regenerated on demand. The native project
folders (`android/`, and later `ios/`) **are** committed; their own nested
`.gitignore` files exclude the heavy build outputs.

## Android — ready to build

The Android project is already scaffolded under `android/`. To build & run it you
need two things installed (≈1 GB total — much lighter than iOS):

1. **Android Studio** — https://developer.android.com/studio
   (bundles the Android SDK, an emulator, and platform tools)
2. **JDK 17** — Android Gradle Plugin 8.x requires Java 17.
   This machine currently has **Java 8**, which is too old.
   Android Studio ships its own bundled JDK 17, so simply building from inside
   Android Studio usually "just works" without touching system Java.
   For command-line Gradle builds, install a JDK 17 (e.g. Temurin 17) and point
   `JAVA_HOME` at it.

Then:

```bash
npm run sync
npm run open:android      # opens Android Studio
```

In Android Studio: pick a device/emulator and press **Run** (▶). To produce a
shareable APK: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## iOS — deferred (needs Xcode first)

The iOS project is **not** scaffolded yet, on purpose. Adding it requires
**CocoaPods**, and *building* it requires the **full Xcode** app (~15 GB) — only
the Command Line Tools are installed on this machine right now. There's no point
generating an Xcode project you can't open.

When you're ready to go iOS:

1. Install **Xcode** from the Mac App Store (~15 GB, 30–60 min).
2. Install **CocoaPods**. Easiest route is Homebrew:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   brew install cocoapods
   ```
   (System Ruby 2.6 here is too old for a plain `gem install cocoapods`.)
3. Add the platform and open it:
   ```bash
   npm install @capacitor/ios@^7   # already installed
   npx cap add ios
   npm run open:ios
   ```
4. In Xcode: set your Apple ID under **Signing & Capabilities** (a free Apple ID
   works for running on your own device; a $99/yr Apple Developer account is only
   needed to ship to the App Store), pick your iPhone, and press **Run** (▶).

## Supabase auth on native — important follow-up

The web app signs in with **magic links**. Inside a native wrapper this needs a
little extra wiring, because the email link opens in the system browser, not the
app:

- Add the native origins to your Supabase **Redirect URLs** allow-list:
  - `capacitor://localhost` (iOS)
  - `http://localhost` and `https://localhost` (Android)
- For the magic link to hand control back to the app, set up a deep link
  (Universal Links / App Links) and handle Capacitor's `appUrlOpen` event, or
  switch the native builds to a different auth flow (e.g. OAuth with
  `@capacitor/browser`, or an OTP-code entry screen instead of a click-through
  link).

This is a known next step — the current scaffold gets the app running on a
device; production-grade native auth is a follow-up task.

## Node version note

Capacitor 8 requires **Node ≥ 22**. This machine has **Node 21.7.1**, which is
end-of-life, so we pinned Capacitor to **7.x** (works on Node 21). Recommended
follow-up: install **Node 22 LTS** (via `nvm`, `fnm`, or the official installer),
after which you can move to Capacitor 8 with `npm install @capacitor/core@latest
@capacitor/cli@latest @capacitor/android@latest @capacitor/ios@latest`.

## Instant alternative — PWA install (no native tooling)

Study Pulse is already an installable PWA. To put it on a phone home screen right
now with zero native build:

- **iPhone (Safari):** open the deployed URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the URL → ⋮ menu → **Install app**.

This runs the exact same app and syncs through Supabase — it just isn't
distributed through the App Store / Play Store.
