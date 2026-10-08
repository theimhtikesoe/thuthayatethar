# Native and offline packaging options

## Current recommendation

Use the installable PWA first. While online, open the catalog and press **Offline အားလုံးသိမ်းမည်**. The app shell, PDF.js worker, Zawgyi converter assets, catalog shell, and every published full-book PDF are stored in Cache Storage. After the button reports **Offline အသင့်**, the Home Screen PWA can open those books without cellular data or Wi-Fi.

On iOS, Safari does not show the Android-style install prompt. Use **Share → Add to Home Screen** while online, then use the installed icon. On Android Chrome, use **Install app** / **Add to Home screen**.

## Native app option

A Capacitor iOS/Android wrapper can be added later, but it does not magically make remote PDFs available offline. There are two choices:

- **Download-on-device:** keep the catalog/API remote and save permitted PDFs in the native filesystem. This supports new books without an App Store release, but the first download still needs internet.
- **Build-time bundled books:** download approved PDFs during the mobile build and ship them in the app. This gives true first-launch offline reading, but every catalog/PDF update requires a new Android/iOS build and store submission. Large PDFs also increase app size.

Because this catalog is currently dynamic, the PWA offline pack is the lower-risk interim solution. Capacitor should be introduced only after deciding whether the books are download-on-device or build-time bundled, and after confirming App Store/Play Store rights for the PDF content.
