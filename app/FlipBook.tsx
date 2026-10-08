"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> };

const PDFJS_VERSION = "3.11.174";

const Page = forwardRef<HTMLDivElement, { src?: string; number: number; total: number; title: string }>(function Page({ src, number, total, title }, ref) {
  return <div className="flip-page" ref={ref}>
    <div className="flip-page-inner">
      {src ? <img src={src} alt={`${title} စာမျက်နှာ ${number}`} draggable={false} /> : <div className="flip-page-loading"><span></span>စာမျက်နှာ {number} ကို ပြင်ဆင်နေသည်…</div>}
      <div className="flip-page-number">{number} / {total}</div>
    </div>
  </div>;
});

export default function FlipBook({ url, title }: { url: string; title: string }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Record<number, string>>({});
  const [current, setCurrent] = useState(0);
  const [size, setSize] = useState({ w: 420, h: 594, single: false });
  const [ratio, setRatio] = useState(1.414);
  const book = useRef<any>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rendering = useRef(new Set<number>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;
        const loaded = await pdfjs.getDocument({ url, withCredentials: false }).promise;
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(vp.height / vp.width);
        setDoc(loaded);
      } catch (e) {
        if (!cancelled) setError("PDF ကို ဖွင့်၍ မရပါ။");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    const measure = () => {
      const el = stage.current;
      if (!el) return;
      const single = el.clientWidth < 760;
      const maxH = el.clientHeight - 24;
      const maxW = single ? el.clientWidth - 24 : (el.clientWidth - 48) / 2;
      let w = Math.min(maxW, maxH / ratio);
      w = Math.max(240, Math.floor(w));
      setSize({ w, h: Math.floor(w * ratio), single });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ratio, doc]);

  const renderPage = useCallback(async (n: number) => {
    if (!doc || n < 1 || n > doc.numPages || rendering.current.has(n)) return;
    rendering.current.add(n);
    const page = await doc.getPage(n);
    const scale = (size.w * Math.min(window.devicePixelRatio || 1, 2)) / page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    const data = canvas.toDataURL("image/jpeg", 0.88);
    setImages((prev) => ({ ...prev, [n]: data }));
  }, [doc, size.w]);

  useEffect(() => {
    if (!doc) return;
    for (let n = current - 1; n <= current + 6; n++) renderPage(n);
  }, [doc, current, renderPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") book.current?.pageFlip()?.flipNext();
      if (e.key === "ArrowLeft") book.current?.pageFlip()?.flipPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = doc?.numPages ?? 0;

  return <div className="flipbook-wrap">
    <div className="flipbook-stage" ref={stage}>
      {error && <div className="flip-status">{error} <a href={url} target="_blank" rel="noreferrer">သီးခြားဖွင့်မည် ↗</a></div>}
      {!error && !doc && <div className="flip-status"><span className="flip-spinner"></span>စာအုပ်ကို ဖွင့်နေသည်…</div>}
      {doc && <HTMLFlipBook
        key={`${size.w}-${size.single}`}
        ref={book}
        width={size.w}
        height={size.h}
        size="fixed"
        minWidth={200} maxWidth={2000} minHeight={200} maxHeight={3000}
        showCover={!size.single}
        usePortrait={size.single}
        mobileScrollSupport
        maxShadowOpacity={0.45}
        flippingTime={800}
        drawShadow
        startPage={current}
        className="flipbook"
        style={{}}
        startZIndex={0} autoSize={false} clickEventForward useMouseEvents swipeDistance={30} showPageCorners disableFlipByClick={false}
        onFlip={(e: any) => setCurrent(e.data)}
      >
        {Array.from({ length: total }, (_, i) => <Page key={i} number={i + 1} total={total} title={title} src={images[i + 1]} />)}
      </HTMLFlipBook>}
    </div>
    {doc && <footer className="flip-nav">
      <button type="button" onClick={() => book.current?.pageFlip()?.flipPrev()} disabled={current === 0}>← ရှေ့သို့</button>
      <div className="flip-progress"><input type="range" min={1} max={total} value={current + 1} onChange={(e) => { const p = Number(e.target.value) - 1; setCurrent(p); book.current?.pageFlip()?.turnToPage(p); }} aria-label="စာမျက်နှာ ရွေးရန်" /><span>{current + 1} / {total}</span></div>
      <button type="button" onClick={() => book.current?.pageFlip()?.flipNext()} disabled={current >= total - 1}>နောက်သို့ →</button>
    </footer>}
  </div>;
}
