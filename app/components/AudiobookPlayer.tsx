"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupAudiobooks, type AudiobookCoverGroup } from "../audiobook-grouping";
import {
  audioProgressStorageKey,
  clearAudioProgress,
  formatAudioTime,
  readAudioProgress,
  saveAudioDuration,
  saveAudioProgress,
} from "../audio-progress";

type Audiobook = {
  id: string | number;
  slug?: string;
  title: string;
  author?: string;
  category?: string;
  coverImage?: string;
  soundcloud_url?: string;
  submissionSource?: string;
};

type WidgetEvent = { currentPosition?: number };
type Widget = {
  bind: (event: string, callback: (event?: WidgetEvent) => void) => void;
  seekTo: (milliseconds: number) => void;
  play: () => void;
  pause: () => void;
  getDuration: (callback: (duration: number) => void) => void;
  getPosition: (callback: (position: number) => void) => void;
  isPaused: (callback: (paused: boolean) => void) => void;
};
type WidgetEvents = {
  READY: string;
  PLAY: string;
  PAUSE: string;
  PLAY_PROGRESS: string;
  FINISH: string;
  ERROR: string;
};
type WidgetFactory = ((iframe: HTMLIFrameElement) => Widget) & { Events: WidgetEvents };
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

function setMediaSessionPlaybackState(state: "none" | "paused" | "playing") {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try { navigator.mediaSession.playbackState = state; } catch { /* Ignore unsupported Media Session state updates. */ }
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

function soundcloudCoverUrl(url?: string) {
  return url ? `/api/soundcloud/cover?url=${encodeURIComponent(url)}` : null;
}

function AudiobookCover({ book }: { book: Audiobook }) {
  const fallback = soundcloudCoverUrl(book.soundcloud_url);
  const [src, setSrc] = useState(book.coverImage || fallback);

  useEffect(() => {
    setSrc(book.coverImage || fallback);
  }, [book.coverImage, book.soundcloud_url, fallback]);

  return <div className="audiobook-cover" aria-hidden="true">
    {src ? <img src={src} loading="lazy" alt="" onError={() => { if (src !== fallback) setSrc(fallback); else setSrc(null); }} /> : <span>♫</span>}
  </div>;
}

export function AudiobookShelf({ books, onPlay }: { books: Audiobook[]; onPlay: (book: Audiobook) => void }) {
  const groups = useMemo(() => groupAudiobooks(books), [books]);
  if (!books.length) return null;
  return <section className="audiobook-section" aria-label="အသံစာအုပ်များ">
    <div className="audiobook-section-heading"><div><p className="eyebrow">နားထောင်ရန်</p><h2>အသံစာအုပ်များ</h2></div><span>{groups.length} အုပ် · {books.length} ခေါင်းစဉ်</span></div>
    <div className="audiobook-grid">
      {groups.map((group) => <AudiobookGroupCard key={group.key} group={group} onPlay={onPlay} />)}
    </div>
  </section>;
}

function audiobookRecordKey(book: Audiobook): string {
  return String(book.slug ?? book.id);
}

function audiobookOptionLabel(title: string): string {
  const normalized = title.normalize("NFKC").replace(/[၀-၉]/g, (digit) => String(digit.charCodeAt(0) - 0x1040));
  const marked = normalized.match(/\b(?:chapter|part|episode)\s*[-_:()]?\s*(\d+)\b/i)
    ?? normalized.match(/(?:အခန်း|အပိုင်း)\s*[-_:()]?\s*(\d+)/);
  if (marked) return `အပိုင်း ${marked[1]}`;
  const trailing = normalized.match(/(?:^|[\s._-])(\d+)\s*$/);
  return trailing ? `အပိုင်း ${trailing[1]}` : title;
}

function AudiobookGroupCard({ group, onPlay }: { group: AudiobookCoverGroup<Audiobook>; onPlay: (book: Audiobook) => void }) {
  const [selectedKey, setSelectedKey] = useState(() => audiobookRecordKey(group.books[0]));
  const selectedBook = group.books.find((book) => audiobookRecordKey(book) === selectedKey) ?? group.books[0];
  const book = group.books[0];

  useEffect(() => {
    if (!group.books.some((item) => audiobookRecordKey(item) === selectedKey)) {
      setSelectedKey(audiobookRecordKey(group.books[0]));
    }
  }, [group.books, selectedKey]);

  return <article className="audiobook-card" key={group.key}>
    <AudiobookCover book={book} />
    <div className="audiobook-card-copy"><small>{book.category || "အသံစာအုပ်"}</small><strong>{group.title}</strong><span>{book.author || "စာရေးသူ မသိရသေးပါ"}</span></div>
    <div className="audiobook-track-picker">
      {group.books.length > 1
        ? <label className="audiobook-track-select"><span>အပိုင်း / ခေါင်းစဉ်ရွေးပါ</span><select value={audiobookRecordKey(selectedBook)} onChange={(event) => setSelectedKey(event.target.value)} aria-label={`${group.title} အပိုင်း သို့မဟုတ် ခေါင်းစဉ်ရွေးရန်`}>{group.books.map((item) => <option key={audiobookRecordKey(item)} value={audiobookRecordKey(item)}>{audiobookOptionLabel(item.title)}</option>)}</select></label>
        : <span className="audiobook-single-track">{selectedBook.title}</span>}
      <button type="button" className="audiobook-listen" onClick={() => onPlay(selectedBook)} aria-label={`${selectedBook.title} ကို နားထောင်မည်`}><span aria-hidden="true">▶</span> နားထောင်မည်</button>
    </div>
  </article>;
}

export default function AudiobookPlayer({ book, onClose }: { book: Audiobook | null; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<Widget | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const [widgetApiState, setWidgetApiState] = useState<"loading" | "ready" | "error">("loading");
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const resumeAfterVisibilityRef = useRef(false);
  const normalizedUrl = useMemo(() => normalizeSoundCloudUrl(book?.soundcloud_url), [book?.soundcloud_url]);
  const playerSrc = useMemo(() => normalizedUrl
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(normalizedUrl)}&auto_play=true&hide_related=true&show_comments=false&visual=false&show_user=false&show_reposts=false&show_teaser=false&show_artwork=false`
    : "", [normalizedUrl]);

  useEffect(() => {
    setWidgetApiState("loading");
    setPlayerReady(false);
    setPlayerError(false);
    setIsPlaying(false);
    positionRef.current = 0;
    durationRef.current = 0;
    setPositionMs(0);
    setDurationMs(0);
    resumeAfterVisibilityRef.current = false;
    if (!book || !normalizedUrl) return;
    let disposed = false;
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
    if (!book || !normalizedUrl || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title: book.title, artist: book.author || "သုတရိပ်သာ", album: "သုတရိပ်သာ · အသံစာအုပ်" });
    const register = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try { session.setActionHandler(action, handler); } catch { /* This browser does not support the action. */ }
    };
    register("play", () => widgetRef.current?.play());
    register("pause", () => {
      resumeAfterVisibilityRef.current = false;
      widgetRef.current?.pause();
    });
    register("seekto", (details) => {
      if (typeof details.seekTime === "number") widgetRef.current?.seekTo(details.seekTime * 1000);
    });
    return () => {
      try {
        session.metadata = null;
        session.playbackState = "none";
        session.setActionHandler("play", null);
        session.setActionHandler("pause", null);
        session.setActionHandler("seekto", null);
      } catch { /* Ignore unsupported media-session cleanup. */ }
    };
  }, [book?.slug, book?.id, book?.title, book?.author, normalizedUrl]);

  useEffect(() => {
    if (!book || !normalizedUrl || widgetApiState !== "ready" || !iframeRef.current || !window.SC?.Widget) return;
    let disposed = false;
    let lastUiUpdate = 0;
    let lastProgressSave = 0;
    const widget = window.SC.Widget(iframeRef.current);
    widgetRef.current = widget;
    const events = window.SC.Widget.Events;
    const saved = readAudioProgress(book, window.localStorage);

    const emitProgressChange = () => window.dispatchEvent(new Event("thuthayatethar:audio-progress"));
    const persistPosition = (position: number, duration = durationRef.current) => {
      if (!Number.isFinite(position) || position < 0) return;
      const safePosition = duration > 0 ? Math.min(position, duration) : position;
      positionRef.current = safePosition;
      setPositionMs(safePosition);
      saveAudioProgress(book, window.localStorage, safePosition, duration);
      emitProgressChange();
    };

    if (saved) {
      positionRef.current = saved.positionMs;
      durationRef.current = saved.durationMs;
      setPositionMs(saved.positionMs);
      setDurationMs(saved.durationMs);
    }

    widget.bind(events.READY, () => {
      if (disposed) return;
      setPlayerReady(true);
      widget.getDuration((duration) => {
        if (disposed || !Number.isFinite(duration) || duration <= 0) return;
        durationRef.current = duration;
        setDurationMs(duration);
        saveAudioDuration(book, window.localStorage, duration);
        if (positionRef.current > duration) {
          positionRef.current = duration;
          setPositionMs(duration);
        }
      });
      if (saved?.positionMs) widget.seekTo(saved.positionMs);
      widget.isPaused((paused) => {
        if (disposed) return;
        setIsPlaying(!paused);
        setMediaSessionPlaybackState(paused ? "paused" : "playing");
        // Opening the player is already initiated by the user's Listen click.
        // Explicitly start the widget after READY so mobile browsers do not
        // leave the first track waiting for a second tap on the dock button.
        if (paused) widget.play();
      });
    });

    widget.bind(events.PLAY, () => {
      if (disposed) return;
      setIsPlaying(true);
      setMediaSessionPlaybackState("playing");
      persistPosition(positionRef.current);
    });
    widget.bind(events.PAUSE, () => {
      if (disposed) return;
      setIsPlaying(false);
      setMediaSessionPlaybackState("paused");
      widget.getPosition((position) => { if (!disposed) persistPosition(position); });
    });

    // Mobile browsers may suspend a third-party iframe while the PWA is
    // backgrounded or the screen is locked. Remember whether it was playing
    // before that lifecycle transition and wake it when the app is visible
    // again. This does not force playback while hidden, which browsers may
    // reject, but prevents a silent player after returning to the PWA.
    const rememberPlaybackBeforeBackground = () => {
      widget.isPaused((paused) => {
        if (!disposed) resumeAfterVisibilityRef.current = !paused;
      });
    };
    const resumeAfterBackground = () => {
      if (disposed || !resumeAfterVisibilityRef.current) return;
      widget.isPaused((paused) => {
        if (disposed || !paused) return;
        widget.play();
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") rememberPlaybackBeforeBackground();
      else resumeAfterBackground();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", rememberPlaybackBeforeBackground);
    window.addEventListener("pageshow", resumeAfterBackground);
    widget.bind(events.PLAY_PROGRESS, (event) => {
      if (disposed || typeof event?.currentPosition !== "number" || !Number.isFinite(event.currentPosition)) return;
      const now = Date.now();
      const position = Math.max(0, event.currentPosition);
      if (now - lastUiUpdate >= 250 || (durationRef.current > 0 && position >= durationRef.current)) {
        positionRef.current = position;
        setPositionMs(durationRef.current > 0 ? Math.min(position, durationRef.current) : position);
        lastUiUpdate = now;
      }
      if (now - lastProgressSave >= 1000) {
        persistPosition(position);
        lastProgressSave = now;
      }
    });
    widget.bind(events.FINISH, () => {
      if (disposed) return;
      resumeAfterVisibilityRef.current = false;
      setIsPlaying(false);
      setMediaSessionPlaybackState("none");
      clearAudioProgress(book, window.localStorage);
      positionRef.current = 0;
      setPositionMs(0);
      emitProgressChange();
    });
    widget.bind(events.ERROR, () => {
      if (disposed) return;
      setPlayerError(true);
      setMediaSessionPlaybackState("none");
    });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", rememberPlaybackBeforeBackground);
      window.removeEventListener("pageshow", resumeAfterBackground);
      if (widgetRef.current === widget) widgetRef.current = null;
      // The iframe is discarded on track changes; this guard prevents stale updates.
    };
  }, [book, normalizedUrl, playerSrc, widgetApiState]);

  if (!book || !normalizedUrl || !playerSrc) return null;

  const togglePlayback = () => {
    const widget = widgetRef.current;
    if (!widget || !playerReady) return;
    if (isPlaying) {
      resumeAfterVisibilityRef.current = false;
      widget.pause();
    }
    else widget.play();
  };

  const seekTo = (value: string) => {
    const position = Number(value);
    if (!Number.isFinite(position)) return;
    positionRef.current = position;
    setPositionMs(position);
    widgetRef.current?.seekTo(position);
    saveAudioProgress(book, window.localStorage, position, durationRef.current);
    window.dispatchEvent(new Event("thuthayatethar:audio-progress"));
  };

  const displayedPosition = durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs;
  const sourceLabel = `SoundCloud မူရင်းအသံစာမျက်နှာကို ဖွင့်မည်`;
  return <aside className="audiobook-dock" aria-label="အသံစာအုပ်ဖွင့်စက်">
    <div className="audiobook-dock-heading"><span className="audiobook-live-dot" /><span className="audiobook-dock-title"><small>ယခုနားထောင်နေသည်</small><strong>{book.title}</strong><span>{book.author || "တင်သူ မသိရသေးပါ"}</span></span>
      <a href={normalizedUrl} target="_blank" rel="noreferrer" className="audiobook-open-source" aria-label={sourceLabel}>SoundCloud ↗</a>
      <button type="button" onClick={onClose} className="audiobook-dock-close" aria-label="အသံဖွင့်စက်ကို ပိတ်မည်">×</button>
    </div>
    <div className="audiobook-controls" aria-label="အသံစာအုပ်ထိန်းချုပ်မှု">
      <button type="button" className="audiobook-play-toggle" onClick={togglePlayback} disabled={!playerReady || playerError} aria-label={isPlaying ? "ခဏရပ်မည်" : "ဆက်နားထောင်မည်"}>
        <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
      </button>
      <input type="range" min="0" max={durationMs || 1} step="1000" value={displayedPosition} disabled={!playerReady || durationMs <= 0 || playerError} onChange={(event) => seekTo(event.target.value)} aria-label="အသံစာအုပ်အတွင်း ဖွင့်နေသည့်နေရာ" />
      <span className="audiobook-time" aria-live="off">{formatAudioTime(displayedPosition)}{durationMs > 0 ? ` / ${formatAudioTime(durationMs)}` : ""}</span>
    </div>
    {widgetApiState !== "ready" || !playerReady || playerError
      ? <p className="audiobook-player-status" role="status">{widgetApiState === "error" || playerError ? "အသံစာအုပ်ကို ဖွင့်မရပါ။ SoundCloud မူရင်းကို စမ်းဖွင့်ပါ။" : "အသံဖွင့်စက်ကို ပြင်ဆင်နေသည်…"}</p>
      : null}
    {widgetApiState === "ready" && <iframe key={`${book.slug ?? book.id}:${normalizedUrl}`} ref={iframeRef} className="audiobook-engine" title={`${book.title} — SoundCloud အသံရင်းမြစ်`} width="1" height="1" loading="eager" scrolling="no" frameBorder="0" allow="autoplay; encrypted-media" aria-hidden="true" tabIndex={-1} src={playerSrc} />}
  </aside>;
}
