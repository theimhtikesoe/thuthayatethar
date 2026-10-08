# Offline reading and Zawgyi overlay

## What works offline

1. Open the site once while online so the app shell, catalog, PDF.js worker, and a book are cached.
2. In the reader, press **Offline သိမ်းမည်** and wait for **Offline သိမ်းပြီး**.
3. The same catalog and full PDF can then be opened without internet. Reading progress and reader theme are stored locally.
4. PDF pages that contain an embedded text layer are checked locally with the bundled `myanmar-tools` Zawgyi detector. Detected Zawgyi text is converted to Unicode and shown as a readable overlay; no network request is needed.

## Important limitation

A scanned/image-only PDF has no text layer for PDF.js to extract. The browser cannot reliably OCR those pages with this feature alone, so the reader shows **ပုံ-only PDF — OCR overlay မပါ** instead of pretending that overlay is available. To support those books, OCR must be run during ingestion (for example, Burmese OCR on the server/worker) and its page text/coordinates stored alongside the PDF. That OCR output can then be cached and rendered with the same overlay component.

## Publishing checklist

- Keep the PDF and OCR/text-layer assets same-origin and cacheable.
- Test each book once online, then enable airplane/offline mode and open it from the catalog.
- Do not publish a scanned book as “Zawgyi overlay ready” until its ingestion job has produced OCR coordinates.
