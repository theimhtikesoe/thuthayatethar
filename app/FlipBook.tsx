"use client";

import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { adjacentPage, visiblePages } from "./reader-navigation.mjs";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> };

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PageImages = createContext<Record<number, string>>({});
const Page = forwardRef<HTMLDivElement, { number: number; total: number; title: string }>(function Page({ number, total, title }, ref) {
  const src = useContext(PageImages)[number];
  const isCover = number === 1;
  return <div className={`flip-page${isCover ? " is-cover" : ""}`} ref={ref}>
    <div className="flip-page-inner">
      {src ? <img src={src} alt={`${title} ${isCover ? "စာအုပ်အဖုံး" : `စာမျက်နှာ ${number}`}`} draggable={false} /> : <div className="flip-page-loading"><span></span>{isCover ? "စာအုပ်အဖုံးကို ပြင်ဆင်နေသည်…" : `စာမျက်နှာ ${number} ကို ပြင်ဆင်နေသည်…`}</div>}
      <div className="flip-page-number">{isCover ? "အဖုံး" : `${number} / ${total}`}</div>
    </div>
  </div>;
});

export default function FlipBook({ url, title, progressKey }: { url: string; title: string; progressKey: string }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState(false);
  const [passwordValue, setPasswordValue] = useState("tgcf");
  const [passwordIncorrect, setPasswordIncorrect] = useState(false);
  const [images, setImages] = useState<Record<number, string>>({});
  const [hires, setHires] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(progressKey));
      return Number.isInteger(saved) && saved >= 0 ? saved : 0;
    } catch { return 0; }
  });
  const [size, setSize] = useState({ w: 420, h: 594, single: false });
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const book = useRef<any>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rendering = useRef(new Set<string>());
  const passwordUpdater = useRef<((password: string) => void) | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number; x: number; y: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let fallbackTried = false;
    let loadingTask: any;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
        loadingTask = pdfjs.getDocument({ url, withCredentials: false, disableAutoFetch: true, disableStream: false, rangeChunkSize: 1048576 });
        loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
          if (!fallbackTried) {
            fallbackTried = true;
            setPasswordValue("tgcf");
            updatePassword("tgcf");
            return;
          }
          passwordUpdater.current = updatePassword;
          setPasswordIncorrect(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
          setPasswordPrompt(true);
        };
        const loaded = await loadingTask.promise;
        if (cancelled) return;
        setPasswordPrompt(false);
        setCurrent((page) => Math.min(Math.max(0, page), loaded.numPages - 1));
        setDoc(loaded);
        // The document already exposes numPages at this point. Start rendering
        // the saved/current page immediately instead of blocking on page 1 just
        // to calculate the aspect ratio; refine the layout when page 1 arrives.
        loaded.getPage(1).then((first: any) => {
          if (cancelled) return;
          const vp = first.getViewport({ scale: 1 });
          setRatio(vp.height / vp.width);
        }).catch(() => { /* Keep the default book ratio if metadata is slow. */ });
      } catch {
        if (!cancelled) setError("PDF ကို ဖွင့်၍ မရပါ။ စာအုပ်ဖိုင်ကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။");
      }
    })();
    return () => { cancelled = true; loadingTask?.destroy?.(); };
  }, [url]);

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
      const h = Math.floor(w * ratio);
      setSize((prev) => (prev.w === w && prev.h === h && prev.single === single ? prev : { w, h, single }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, doc]);

  const draw = useCallback(async (n: number, cssWidth: number) => {
    if (!doc) throw new Error("PDF is not ready");
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 }).width;
    const px = Math.min(cssWidth * Math.min(window.devicePixelRatio || 1, 1.6), 2400);
    const vp = page.getViewport({ scale: px / base });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    await page.render({ canvasContext: context, viewport: vp }).promise;
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
    const first = current + 1;
    const spread = size.single || first === 1 ? [first] : [first % 2 === 0 ? first : first - 1, first % 2 === 0 ? first + 1 : first];
    const nearby = [current, current + 1, current + 2, current - 1].map((page) => page + 1);
    const queue = Array.from(new Set([...spread, ...nearby])).filter((page) => page >= 1 && page <= doc.numPages);
    let cancelled = false;
    (async () => {
      // One-at-a-time avoids several large range requests competing on mobile;
      // the visible spread is always rendered before neighboring pages.
      for (const page of queue) {
        if (cancelled) return;
        await renderPage(page);
      }
    })();
    return () => { cancelled = true; };
  }, [doc, current, size.single, renderPage]);

  const saveProgress = useCallback((page: number) => {
    try { localStorage.setItem(progressKey, String(page)); } catch { /* Storage may be disabled. */ }
  }, [progressKey]);

  // Pages visible on the current spread (1-based).
  const total = doc?.numPages ?? 0;
  const visible = visiblePages(current, total, size.single);
  const atEnd = (visible[visible.length - 1] ?? 0) >= total;
  // Keep the library's children stable. Image updates must not call
  // updateFromHtml(), which interrupts page flips and resets its handlers.
  const pages = useMemo(() => Array.from({ length: total }, (_, i) =>
    <Page key={i} number={i + 1} total={total} title={title} />
  ), [total, title]);

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

  const goTo = (p: number) => {
    const next = clamp(p, 0, Math.max(0, total - 1));
    const controller = book.current?.pageFlip();
    if (!controller || total === 0) return;
    // A single immediate navigation path also works while zoomed, after
    // scrubbing, and during rapid clicks, without remounting the book.
    controller.turnToPage(next);
    const actual = controller.getCurrentPageIndex();
    setCurrent(actual);
    saveProgress(actual);
    setPan({ x: 0, y: 0 });
  };
  const goPrevious = () => {
    goTo(adjacentPage(current, total, size.single, -1));
  };
  const goNext = () => {
    if (!atEnd) goTo(adjacentPage(current, total, size.single, 1));
  };
  const zoomed = zoom > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,button,[contenteditable]")) return;
      if (["ArrowRight", "ArrowLeft", "+", "=", "-", "0", "Escape"].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrevious();
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
    const r = stage.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
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
    if (e.pointerType === "touch" && pts.length === 1 && now - lastTap.current < 300) {
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
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
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
      {passwordPrompt && <form className="pdf-password-prompt" onSubmit={(event) => { event.preventDefault(); passwordUpdater.current?.(passwordValue); setPasswordPrompt(false); }}>
        <span className="password-lock" aria-hidden="true">▣</span>
        <strong>စကားဝှက်ဖြင့် ဖတ်ရှုရန်</strong>
        <p>{passwordIncorrect ? "tgcf ဖြင့် မဖွင့်နိုင်ပါ။ မှန်ကန်သော စကားဝှက်ကို စမ်းကြည့်ပါ။" : "ပုံမှန်စကားဝှက် tgcf ဖြင့် ဖွင့်မရပါ။ အခြားစကားဝှက်ကို ထည့်ပါ။"}</p>
        <label htmlFor="pdf-password">PDF စကားဝှက်</label>
        <input id="pdf-password" type="password" value={passwordValue} onChange={(event) => setPasswordValue(event.target.value)} autoComplete="current-password" autoFocus />
        <button type="submit">ဖွင့်မည် →</button>
      </form>}
      {!error && !doc && <div className="flip-status"><span className="flip-spinner"></span>စာအုပ်ကို ဖွင့်နေသည်…</div>}
      {doc && <PageImages.Provider value={images}><div className="flipbook-holder" style={{ width: size.single ? size.w : size.w * 2, height: size.h }}>
        <HTMLFlipBook
          key={`${size.w}-${size.h}-${size.single}`}
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
          {pages}
        </HTMLFlipBook>
      </div></PageImages.Provider>}
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
      <button type="button" className="flip-nav-btn" onClick={goPrevious} disabled={current === 0} aria-label="အရင်စာမျက်နှာ">‹<span> အရင်သို့</span></button>
      <div className="flip-progress">
        <button type="button" className="flip-skip-btn" onClick={() => goTo(0)} disabled={current === 0} aria-label="ပထမစာမျက်နှာသို့ သွားမည်" title="ပထမစာမျက်နှာ">«</button>
        <input type="range" min={1} max={total} value={current + 1} onChange={(e) => goTo(Number(e.target.value) - 1)} aria-label="စာမျက်နှာ ရွေးရန်" />
        <span className="flip-count" aria-live="polite">{visible.join("–")}<small> / {total}</small></span>
        <button type="button" className="flip-skip-btn" onClick={() => goTo(total - 1)} disabled={atEnd} aria-label="နောက်ဆုံးစာမျက်နှာသို့ သွားမည်" title="နောက်ဆုံးစာမျက်နှာ">»</button>
      </div>
      <div className="flip-zoom" role="group" aria-label="ချဲ့/ချုံ့">
        <button type="button" onClick={() => setZoomTo(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="ချုံ့မည်">−</button>
        <button type="button" className="flip-zoom-value" onClick={() => setZoomTo(zoomed ? 1 : 2)} aria-label="ချဲ့မှုပြန်ညှိမည်">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoomTo(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="ချဲ့မည်">+</button>
      </div>
      <button type="button" className="flip-nav-btn" onClick={goNext} disabled={atEnd} aria-label="နောက်စာမျက်နှာ"><span>နောက်သို့ </span>›</button>
    </footer>}
  </div>;
}
