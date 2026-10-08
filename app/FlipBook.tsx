"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { convertZawgyiText, detectMyanmarText } from "./zawgyi";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> };
type OverlayItem = { text: string; left: number; top: number; width: number; fontSize: number; isZawgyi: boolean };

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const Page = forwardRef<HTMLDivElement, { src?: string; number: number; total: number; title: string; overlay?: OverlayItem[] }>(function Page({ src, number, total, title, overlay = [] }, ref) {
  const isCover = number === 1;
  return <div className={`flip-page${isCover ? " is-cover" : ""}`} ref={ref}>
    <div className="flip-page-inner">
      {src ? <img src={src} alt={`${title} ${isCover ? "စာအုပ်အဖုံး" : `စာမျက်နှာ ${number}`}`} draggable={false} /> : <div className="flip-page-loading"><span></span>{isCover ? "စာအုပ်အဖုံးကို ပြင်ဆင်နေသည်…" : `စာမျက်နှာ ${number} ကို ပြင်ဆင်နေသည်…`}</div>}
      {overlay.length > 0 && <div className="zawgyi-overlay" aria-label="Zawgyi စာကို Unicode ဖြင့် ပြထားသည်">{overlay.map((item, index) => <span key={`${number}-${index}`} style={{ left: `${item.left}%`, top: `${item.top}%`, width: `${item.width}%`, fontSize: `${item.fontSize}px` }}>{item.text}</span>)}</div>}
      <div className="flip-page-number">{isCover ? "အဖုံး" : `${number} / ${total}`}</div>
    </div>
  </div>;
});

export default function FlipBook({ url, title, progressKey, overlayEnabled = true }: { url: string; title: string; progressKey: string; overlayEnabled?: boolean }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});
  const [overlays, setOverlays] = useState<Record<number, OverlayItem[]>>({});
  const [overlayState, setOverlayState] = useState<"checking" | "ready" | "image-only">("checking");
  const [hires, setHires] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(progressKey));
      return Number.isInteger(saved) && saved >= 0 ? saved : 0;
    } catch { return 0; }
  });
  const [bookResetVersion, setBookResetVersion] = useState(0);
  const [size, setSize] = useState({ w: 420, h: 594, single: false });
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const book = useRef<any>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rendering = useRef(new Set<string>());
  const jumpResetTimer = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number; x: number; y: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
        const loaded = await pdfjs.getDocument({ url, withCredentials: false, disableAutoFetch: true, disableStream: false, rangeChunkSize: 262144 }).promise;
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setCurrent((page) => Math.min(Math.max(0, page), loaded.numPages - 1));
        setRatio(vp.height / vp.width);
        setDoc(loaded);
        setOverlayState("checking");
      } catch {
        if (!cancelled) setError("PDF ကို ဖွင့်၍ မရပါ။");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // PDF.js can expose an embedded text layer even when the visible page is a
  // raster image. Convert only detected Zawgyi locally and draw it over the
  // page; no OCR/network request is involved.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      let foundText = false;
      let foundZawgyi = false;
      const next: Record<number, OverlayItem[]> = {};
      const firstPageToCheck = Math.max(1, current);
      const lastPageToCheck = Math.min(doc.numPages, current + 4);
      for (let n = firstPageToCheck; n <= lastPageToCheck; n += 1) {
        try {
          const page = await doc.getPage(n);
          const content = await page.getTextContent();
          const base = page.getViewport({ scale: 1 });
          const rawItems = content.items as Array<{ str?: string; transform?: number[]; width?: number }>;
          const pageText = rawItems.map((raw) => raw.str ?? "").join(" ");
          const pageDetection = await detectMyanmarText(pageText);
          const items: OverlayItem[] = [];
          for (const raw of rawItems) {
            if (!raw.str?.trim() || !raw.transform) continue;
            foundText = true;
            // Detect against the whole page, not each tiny PDF text fragment.
            // Short fragments make the detector misclassify valid Unicode and
            // the resulting overlay then hides the correct source text.
            if (!pageDetection.isZawgyi) continue;
            foundZawgyi = true;
            const scale = size.w / base.width;
            const fontSize = Math.max(7, Math.abs(raw.transform[3] || raw.transform[0] || 10) * scale);
            const x = (raw.transform[4] || 0) / base.width * 100;
            const y = (1 - (raw.transform[5] || 0) / base.height) * 100 - fontSize / base.height * 100;
            items.push({ text: await convertZawgyiText(raw.str), left: x, top: Math.max(0, y), width: Math.max(4, (raw.width || 20) / base.width * 100), fontSize, isZawgyi: true });
          }
          if (items.length) next[n] = items;
        } catch { /* A page without extractable text is handled as image-only. */ }
      }
      if (!cancelled) {
        setOverlays(next);
        setOverlayState(foundZawgyi ? "ready" : foundText ? "ready" : "image-only");
      }
    })();
    return () => { cancelled = true; };
  }, [doc, size.w, current]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = el.clientWidth - padX;
      const availH = el.clientHeight - padY;
      const single = el.clientWidth < 760;
      const maxW = single ? availW : availW / 2;
      const w = Math.max(200, Math.floor(Math.min(maxW, availH / ratio)));
      setSize((prev) => (prev.w === w && prev.single === single ? prev : { w, h: Math.floor(w * ratio), single }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, doc]);

  const draw = useCallback(async (n: number, cssWidth: number) => {
    const page = await doc!.getPage(n);
    const base = page.getViewport({ scale: 1 }).width;
    const px = Math.min(cssWidth * Math.min(window.devicePixelRatio || 1, 1.6), 2400);
    const vp = page.getViewport({ scale: px / base });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    return canvas.toDataURL("image/jpeg", 0.84);
  }, [doc]);

  const renderPage = useCallback(async (n: number) => {
    const key = `${n}`;
    if (!doc || n < 1 || n > doc.numPages || rendering.current.has(key)) return;
    rendering.current.add(key);
    try {
      const data = await draw(n, size.w);
      setImages((prev) => {
        const next = { ...prev, [n]: data };
        for (const page of Object.keys(next)) {
          if (Math.abs(Number(page) - (current + 1)) > 6) delete next[Number(page)];
        }
        return next;
      });
    } catch { /* The page can be retried on the next navigation. */ }
    finally { rendering.current.delete(key); }
  }, [doc, size.w, draw, current]);

  useEffect(() => {
    if (!doc) return;
    for (let n = current - 1; n <= current + 3; n++) renderPage(n + 1);
  }, [doc, current, renderPage]);

  const saveProgress = useCallback((page: number) => {
    try { localStorage.setItem(progressKey, String(page)); } catch { /* Storage may be disabled. */ }
  }, [progressKey]);

  // Pages visible on the current spread (1-based).
  const total = doc?.numPages ?? 0;
  const visible = (() => {
    const p = current + 1;
    if (size.single || p === 1) return [p];
    const left = p % 2 === 0 ? p : p - 1;
    return [left, left + 1].filter((n) => n <= total);
  })();

  // Sharper render for the zoom layer.
  const zoomLevel = zoom > 2 ? 4 : 2;
  useEffect(() => {
    if (!doc || zoom <= 1) return;
    visible.forEach(async (n) => {
      const key = `${n}@${zoomLevel}`;
      if (rendering.current.has(key)) return;
      rendering.current.add(key);
      try {
        const data = await draw(n, size.w * zoomLevel);
        setHires((prev) => ({ ...prev, [key]: data }));
      } catch { /* The high-resolution image can be retried later. */ }
      finally { rendering.current.delete(key); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, zoom > 1, zoomLevel, current, size.w, draw]);

  const clampPan = useCallback((x: number, y: number, z: number) => {
    const spreadW = size.w * visible.length;
    const el = stage.current;
    const vw = el?.clientWidth ?? spreadW;
    const vh = el?.clientHeight ?? size.h;
    const mx = Math.max(0, (spreadW * z - vw) / 2 + 16);
    const my = Math.max(0, (size.h * z - vh) / 2 + 16);
    return { x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  }, [size.w, size.h, visible.length]);

  const setZoomTo = useCallback((z: number, focus?: { x: number; y: number }) => {
    setZoom((prevZ) => {
      const nz = clamp(Math.round(z * 100) / 100, MIN_ZOOM, MAX_ZOOM);
      setPan((prev) => {
        if (nz <= 1) return { x: 0, y: 0 };
        const f = focus ?? { x: 0, y: 0 };
        const k = nz / prevZ;
        return clampPan(f.x - (f.x - prev.x) * k, f.y - (f.y - prev.y) * k, nz);
      });
      return nz;
    });
  }, [clampPan]);

  const flipNext = () => book.current?.pageFlip()?.flipNext();
  const flipPrev = () => book.current?.pageFlip()?.flipPrev();
  const goTo = (p: number, deferReset = false) => {
    const next = clamp(p, 0, Math.max(0, total - 1));
    setCurrent(next);
    saveProgress(next);
    if (jumpResetTimer.current !== null) window.clearTimeout(jumpResetTimer.current);
    if (deferReset) {
      jumpResetTimer.current = window.setTimeout(() => setBookResetVersion((version) => version + 1), 120);
    } else setBookResetVersion((version) => version + 1);
    setPan({ x: 0, y: 0 });
  };
  useEffect(() => () => { if (jumpResetTimer.current !== null) window.clearTimeout(jumpResetTimer.current); }, []);
  const zoomed = zoom > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { zoomed ? goTo(Math.min(total - 1, current + visible.length)) : flipNext(); }
      if (e.key === "ArrowLeft") { zoomed ? goTo(Math.max(0, current - (size.single ? 1 : 2))) : flipPrev(); }
      if (e.key === "+" || e.key === "=") setZoomTo(zoom + ZOOM_STEP);
      if (e.key === "-") setZoomTo(zoom - ZOOM_STEP);
      if (e.key === "0" || e.key === "Escape") setZoomTo(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Ctrl/trackpad-pinch wheel zoom on desktop.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect();
      const focus = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoomTo(zoom * Math.exp(-e.deltaY * 0.01), focus);
      } else if (zoomed) {
        e.preventDefault();
        setPan((p) => clampPan(p.x - e.deltaX, p.y - e.deltaY, zoom));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomed, setZoomTo, clampPan]);

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  // Pinch-to-zoom on touch, and double-tap / double-click toggle. Captured so it
  // runs before the flip library sees the gesture.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2) {
      const mid = localPoint({ clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 });
      gesture.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom, x: pan.x, y: pan.y, px: mid.x, py: mid.y };
      e.stopPropagation();
    } else if (zoomed) {
      const p = localPoint(e);
      gesture.current = { dist: 0, zoom, x: pan.x, y: pan.y, px: p.x, py: p.y };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const now = Date.now();
    if (pts.length === 1 && now - lastTap.current < 300) {
      e.stopPropagation();
      setZoomTo(zoomed ? 1 : 2, localPoint(e));
      lastTap.current = 0;
    } else lastTap.current = now;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = Array.from(pointers.current.values());
    if (pts.length === 2 && g.dist > 0) {
      e.stopPropagation();
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const nz = clamp(g.zoom * (d / g.dist), MIN_ZOOM, MAX_ZOOM);
      const k = nz / g.zoom;
      setZoom(nz);
      setPan(nz <= 1 ? { x: 0, y: 0 } : clampPan(g.px - (g.px - g.x) * k, g.py - (g.py - g.y) * k, nz));
    } else if (pts.length === 1 && zoomed && g.dist === 0) {
      const p = localPoint(e);
      setPan(clampPan(g.x + (p.x - g.px), g.y + (p.y - g.py), zoom));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      if (zoom < 1.05) setZoomTo(1);
    }
  };

  return <div className={`flipbook-wrap${zoomed ? " is-zoomed" : ""}`}>
    <div
      className="flipbook-stage"
      ref={stage}
      onPointerDownCapture={onPointerDown}
      onPointerMoveCapture={onPointerMove}
      onPointerUpCapture={onPointerUp}
      onPointerCancelCapture={onPointerUp}
    >
      {error && <div className="flip-status">{error} <a href={url} target="_blank" rel="noreferrer">သီးခြားဖွင့်မည် ↗</a></div>}
      {!error && !doc && <div className="flip-status"><span className="flip-spinner"></span>စာအုပ်ကို ဖွင့်နေသည်…</div>}
      {doc && overlayState === "image-only" && <div className="pdf-overlay-note">ပုံ-only PDF — OCR overlay မပါ</div>}
      {doc && overlayState === "ready" && Object.keys(overlays).length > 0 && <div className="pdf-overlay-note is-ready">{overlayEnabled ? "Zawgyi စာကို Unicode ဖြင့် ပြထားသည်" : "မူရင်း PDF စာသားကို ပြထားသည်"}</div>}
      {doc && <div className="flipbook-holder" style={{ width: size.single ? size.w : size.w * 2, height: size.h }}>
        <HTMLFlipBook
          key={`${size.w}-${size.single}-${bookResetVersion}`}
          ref={book}
          width={size.w}
          height={size.h}
          size="fixed"
          minWidth={200} maxWidth={2000} minHeight={200} maxHeight={3000}
          showCover
          usePortrait={size.single}
          mobileScrollSupport={false}
          maxShadowOpacity={0.45}
          flippingTime={260}
          drawShadow
          startPage={Math.min(current, total - 1)}
          className="flipbook"
          style={{}}
          startZIndex={0} autoSize={false} clickEventForward useMouseEvents={!zoomed} swipeDistance={30} showPageCorners={!zoomed} disableFlipByClick
          onFlip={(e: any) => { setCurrent(e.data); saveProgress(e.data); }}
        >
          {Array.from({ length: total }, (_, i) => <Page key={i} number={i + 1} total={total} title={title} src={images[i + 1]} overlay={overlayEnabled ? overlays[i + 1] : undefined} />)}
        </HTMLFlipBook>
      </div>}
      {doc && zoomed && <div className="flip-zoom-layer" aria-label="ချဲ့ကြည့်နေသည်">
        <div className="flip-zoom-spread" style={{ width: size.w * visible.length, height: size.h, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {visible.map((n) => {
            const src = hires[`${n}@${zoomLevel}`] ?? hires[`${n}@2`] ?? images[n];
            return <div key={n} className="flip-zoom-page" style={{ width: size.w, height: size.h }}>{src && <img src={src} alt={`${title} စာမျက်နှာ ${n}`} draggable={false} />}</div>;
          })}
        </div>
        <div className="flip-zoom-hint">ဆွဲ၍ ရွှေ့ကြည့်ပါ · နှစ်ချက်နှိပ်လျှင် ပြန်ချုံ့မည်</div>
      </div>}
    </div>
    {doc && <footer className="flip-nav">
      <button type="button" className="flip-nav-btn" onClick={() => zoomed ? goTo(Math.max(0, current - (size.single ? 1 : 2))) : flipPrev()} disabled={current === 0} aria-label="ရှေ့စာမျက်နှာ">‹<span> ရှေ့သို့</span></button>
      <div className="flip-progress">
        <button type="button" className="flip-skip-btn" onClick={() => goTo(0)} disabled={current === 0} aria-label="ပထမစာမျက်နှာသို့ သွားမည်" title="ပထမစာမျက်နှာ">«</button>
        <input type="range" min={1} max={total} value={current + 1} onChange={(e) => goTo(Number(e.target.value) - 1, true)} aria-label="စာမျက်နှာ ရွေးရန်" />
        <span className="flip-count">{current + 1}<small> / {total}</small></span>
        <button type="button" className="flip-skip-btn" onClick={() => goTo(total - 1)} disabled={current >= total - 1} aria-label="နောက်ဆုံးစာမျက်နှာသို့ သွားမည်" title="နောက်ဆုံးစာမျက်နှာ">»</button>
      </div>
      <div className="flip-zoom" role="group" aria-label="ချဲ့/ချုံ့">
        <button type="button" onClick={() => setZoomTo(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="ချုံ့မည်">−</button>
        <button type="button" className="flip-zoom-value" onClick={() => setZoomTo(zoomed ? 1 : 2)} aria-label="ချဲ့မှုပြန်ညှိမည်">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoomTo(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="ချဲ့မည်">+</button>
      </div>
      <button type="button" className="flip-nav-btn" onClick={() => zoomed ? goTo(Math.min(total - 1, current + visible.length)) : flipNext()} disabled={current >= total - 1} aria-label="နောက်စာမျက်နှာ"><span>နောက်သို့ </span>›</button>
    </footer>}
  </div>;
}
