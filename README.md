# Memory Garden

Click Sprig to cycle through garden reminders first, then 24 questions about creativity, relationships, curiosity, rest, routines, and everyday moments. Even a full garden can use a question in an existing thread. The optional model checks `/api/availability`; missing endpoints, missing keys, rejected requests, and timeouts trigger a five-minute retry cooldown while local prompts keep working. The availability endpoint checks configuration; the actual model request determines whether the key/provider works.

Personalized prompts use a temporary context map computed from local journal data: explicit tags and two short excerpts from up to seven current-season threads and three older threads. Removed threads are excluded and older seasons receive less weight. When the model is available, this context is sent to the configured model service to adapt the selected question. It is not a separate stored personality profile; journal persistence remains local.

Sprig works without a model or a server: local rules suggest revisiting after 7 days, reviewing older or blooming plants for harvest, and completing a garden after 90 days or after its plants are harvested. Suggestions rotate, open the relevant thread or season confirmation, and never harvest automatically. Fresh writing prompts may be enhanced by the model; after 5 seconds or any failure the local prompt remains usable.

Journals save automatically to IndexedDB on the user's device, scoped to the browser and site address. A static hosted copy uses the same local storage and works without the model endpoints. Open the growing-thoughts list to save or load a JSON backup containing all gardens, threads, entries, and tags. Loading replaces the current browser journal after confirmation. Backups can move memories between browsers, devices, or site addresses. Clearing browser site data removes the local journal, so keep backups. Offline app caching requires HTTPS (or localhost) and an initial online visit.

An offline-first journal where new thoughts are planted, revisiting a thread
tends its plant, and archived gardens become rings in a central memory tree.

## Run the chat test

1. Copy `.env.example` to `.env`.
2. Put your OpenRouter API key in `.env`.
3. Run `npm start`.
4. Open <http://localhost:3000>.

On Windows systems that block PowerShell's npm shim, use `npm.cmd start`.

The browser calls local server endpoints. Only the server contacts OpenRouter,
so the API key is never shipped to the browser. Journal data is stored in the
browser's local IndexedDB database and the app shell is cached by a service
worker for offline use. When the LLM is unavailable, Sprig uses local generic
prompts and entries continue to work normally.

## Current prototype

- Seven-plot isometric late-spring garden with a central memory tree.
- One-sided, timestamped journal threads stored locally.
- Plants grow when entries are added and become gently dormant after inactivity.
- LLM-assisted editable tags for themes, topics, interests, roles, and projects.
- Typed bird-helper suggestions with a fully offline fallback.
- Manual garden archiving and local tree-ring browsing.
- Installable responsive PWA shell and generated sprite sheets.

Generated sprite assets live in `public/assets/sprites`. Chroma-key source sheets
are retained in `public/assets/raw` for future recutting and iteration.

## Mobile builds

The Android and iOS apps use Capacitor to package the same offline-first web app
inside a native WebView. Journal entries remain in the device's local storage.
A fresh installation starts with an empty garden.

### Android

Android Studio, its bundled Java runtime, and Android SDK 36 are used for local
builds. To refresh the native project and create a debug APK:

```powershell
npm.cmd run mobile:sync
Set-Location android
.\gradlew.bat assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

### iPhone and iPad

The generated Xcode project is in `ios/App`. It must be compiled and signed by
Xcode on macOS before it can run on a physical Apple device.

`codemagic.yaml` provides two cloud workflows:

- `ios-simulator` builds an unsigned `.app` for an iOS Simulator.
- `ios-device` builds a signed development `.ipa` after an Apple development
  certificate and matching provisioning profile have been added in Codemagic.

The bundle identifier used by both mobile projects is
`com.memorygarden.app`.
