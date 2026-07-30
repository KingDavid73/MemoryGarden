# Memory Garden

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
