"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Audiobook = {
  id: string | number;
  slug?: string;
  title: string;
  author?: string;
  category?: string;
  coverImage?: string;
  soundcloud_url?: string;
};

type Widget = {
  bind: (event: string, callback: (event?: { currentPosition?: number }) => void) => void;
  seekTo: (milliseconds: number) => void;
};
type WidgetFactory = ((iframe: HTMLIFrameElement) => Widget) & { Events: Record<string, string> };
type SoundCloudApi = { Widget: WidgetFactory };

declare global {
  interface Window { SC?: SoundCloudApi }
}

let apiPromise: Promise<void> | null = null;
function loadWidgetApi(): Promise<void> {
  if (typeof window === "undefined" || window.SC?.Widget) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-soundcloud-widget="true"]');
    const script = existing ?? document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.dataset.soundcloudWidget = "true";
    script.onload = () => resolve();
    script.onerror = () => { apiPromise = null; reject(new Error("soundcloud_widget_unavailable")); };
    if (!existing) document.head.appendChild(script);
    else if (window.SC?.Widget) resolve();
  });
  return apiPromise;
}

export function normalizeSoundCloudUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || !["soundcloud.com", "on.soundcloud.com"].includes(host)) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

function progressStorageKey(book: Audiobook) {
  return `thuthayatethar:audio-progress:${book.slug ?? book.id}`;
}

export function AudiobookShelf({ books, onPlay }: { books: Audiobook[]; onPlay: (book: Audiobook) => void }) {
  if (!books.length) return null;
  return <section className="audiobook-section" aria-label="အသံစာအုပ်များ">
    <div className="audiobook-section-heading"><div><p className="eyebrow">နားဆင်ရန်</p><h2>အသံစာအုပ်များ</h2></div><span>{books.length} အုပ်</span></div>
    <div className="audiobook-grid">
      {books.map((book) => <article className="audiobook-card" key={book.slug ?? book.id}>
        <div className="audiobook-cover" aria-hidden="true">
          {book.coverImage ? <img src={book.coverImage} loading="lazy" alt="" /> : <span>♫</span>}
          <span className="audiobook-cover-mark">သုတရိပ်သာ · AUDIO</span>
        </div>
        <div className="audiobook-card-copy"><small>{book.category || "အသံစာအုပ်"}</small><strong>{book.title}</strong><span>{book.author || "စာရေးသူ မသိရသေးပါ"}</span></div>
        <button type="button" className="audiobook-listen" onClick={() => onPlay(book)} aria-label={`${book.title} ကို နားထောင်မည်`}><span aria-hidden="true">▶</span> နားထောင်မည်</button>
      </article>)}
    </div>
  </section>;
}

export default function AudiobookPlayer({ book, onClose }: { book: Audiobook | null; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [widgetApiState, setWidgetApiState] = useState<"loading" | "ready" | "error">("loading");
  const normalizedUrl = useMemo(() => normalizeSoundCloudUrl(book?.soundcloud_url), [book?.soundcloud_url]);
  const playerSrc = useMemo(() => normalizedUrl
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(normalizedUrl)}&auto_play=true&hide_related=true&show_comments=false&visual=false&show_user=true&show_reposts=false&show_teaser=false`
    : "", [normalizedUrl]);

  useEffect(() => {
    let disposed = false;
    setWidgetApiState("loading");
    if (!book || !normalizedUrl) return;
    void loadWidgetApi().then(() => {
      if (!disposed) setWidgetApiState("ready");
    }).catch(() => {
      if (!disposed) setWidgetApiState("error");
    });
    return () => { disposed = true; };
  }, [book?.slug, book?.id, normalizedUrl]);

  useEffect(() => {
    document.body.classList.toggle("audiobook-playing", Boolean(book && normalizedUrl));
    return () => document.body.classList.remove("audiobook-playing");
  }, [book, normalizedUrl]);

  useEffect(() => {
    if (!book || !normalizedUrl || widgetApiState !== "ready" || !iframeRef.current || !window.SC?.Widget) return;
    let disposed = false;
    const widget = window.SC.Widget(iframeRef.current);
    const events = window.SC.Widget.Events;
    widget.bind(events.READY, () => {
      if (disposed) return;
      try {
        const saved = Number(localStorage.getItem(progressStorageKey(book)));
        if (Number.isFinite(saved) && saved > 0) widget.seekTo(saved);
      } catch { /* Storage can be unavailable in private browsing. */ }
    });
    widget.bind(events.PLAY_PROGRESS, (event) => {
      if (disposed || typeof event?.currentPosition !== "number" || !Number.isFinite(event.currentPosition)) return;
      try { localStorage.setItem(progressStorageKey(book), String(Math.max(0, Math.floor(event.currentPosition)))); }
      catch { /* Playback remains available when storage is disabled. */ }
    });
    widget.bind(events.FINISH, () => {
      if (disposed) return;
      try { localStorage.setItem(progressStorageKey(book), "0"); } catch { /* Ignore unavailable storage. */ }
    });
    return () => { disposed = true; };
  }, [book, normalizedUrl, playerSrc, widgetApiState]);

  if (!book || !normalizedUrl || !playerSrc) return null;
  return <aside className="audiobook-dock" aria-label="SoundCloud အသံစာအုပ်ဖွင့်စက်">
    <div className="audiobook-dock-heading"><span className="audiobook-live-dot" /><span className="audiobook-dock-title"><small>ယခုနားဆင်နေသည်</small><strong>{book.title}</strong><span>{book.author || "အသံစာအုပ်"}</span></span>
      <a href={normalizedUrl} target="_blank" rel="noreferrer" className="audiobook-open-source">SoundCloud ↗</a>
      <button type="button" onClick={onClose} className="audiobook-dock-close" aria-label="အသံဖွင့်စက်ကို ပိတ်မည်">×</button>
    </div>
    {widgetApiState === "ready" ? <iframe key={`${book.slug ?? book.id}:${normalizedUrl}`} ref={iframeRef} title={`${book.title} — SoundCloud player`} width="100%" height="110" scrolling="no" frameBorder="0" allow="autoplay" src={playerSrc} /> : <p className="audiobook-player-status" role="status">{widgetApiState === "error" ? "SoundCloud player unavailable. Open the track in SoundCloud." : "SoundCloud player is loading…"}</p>}
  </aside>;
}
