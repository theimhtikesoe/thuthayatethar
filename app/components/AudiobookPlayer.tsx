"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { groupAudiobooks, type AudiobookCoverGroup } from "../audiobook-grouping";
import { isBedAungThaik, isPinnedAudiobook } from "../catalog-grouping";
import { correctedCatalogTitle } from "../burmese-text";
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
  audio_url?: string;
  audioParts?: Array<{ url: string; index: number; byteSize?: number }>;
  youtube_url?: string;
  youtubeAudioStatus?: string;
  sourceType?: string;
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
const preparedWidgets = new Map<string, Widget>();
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

const audiobookCoverPalette = [["#dbe7df", "#315a50"], ["#f0dfc8", "#80553c"], ["#d9dfef", "#485d83"], ["#eedce5", "#814d68"], ["#dce6ec", "#3d6570"], ["#e8e1ce", "#625638"]];

function audiobookCoverColors(book: Audiobook) {
  const identity = `${book.slug ?? book.id}:${book.title}`;
  const hash = Array.from(identity).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return audiobookCoverPalette[hash % audiobookCoverPalette.length];
}

function AudiobookCover({ book, coverImage }: { book: Audiobook; coverImage?: string }) {
  const candidates = Array.from(new Set([coverImage || book.coverImage, soundcloudCoverUrl(book.soundcloud_url)].filter((value): value is string => Boolean(value))));
  const candidateKey = candidates.join("\u0000");
  const [imageIndex, setImageIndex] = useState(0);
  useEffect(() => setImageIndex(0), [candidateKey]);
  const src = candidates[imageIndex];
  const [background, accent] = audiobookCoverColors(book);
  const style = { "--audiobook-cover-bg": background, "--audiobook-cover-accent": accent } as CSSProperties;

  return <div className="audiobook-cover" style={style}>
    {src && <img src={src} loading="lazy" decoding="async" alt={`${book.title} စာအုပ်အဖုံး`} onError={() => setImageIndex((index) => index + 1)} />}
    <div className="audiobook-cover-placeholder" aria-hidden={Boolean(src)}><span aria-hidden="true">♫</span><strong>{book.title}</strong><small>{book.author || "အသံစာအုပ်"}</small></div>
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

/** Start a preloaded SoundCloud widget directly inside the Listen click handler. */
export function playPreparedAudiobook(book: Audiobook): boolean {
  const widget = preparedWidgets.get(audiobookRecordKey(book));
  if (!widget) return false;
  widget.play();
  return true;
}

function PreparedAudiobookWidget({ book }: { book: Audiobook }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = normalizeSoundCloudUrl(book.soundcloud_url);
  useEffect(() => {
    if (!url || !iframeRef.current) return;
    let disposed = false;
    void loadWidgetApi().then(() => {
      if (disposed || !iframeRef.current || !window.SC?.Widget) return;
      const widget = window.SC.Widget(iframeRef.current);
      widget.bind(window.SC.Widget.Events.READY, () => {
        if (disposed) return;
        preparedWidgets.set(audiobookRecordKey(book), widget);
        window.dispatchEvent(new Event("thuthayatethar:audio-widget-ready"));
      });
    });
    return () => {
      disposed = true;
      if (preparedWidgets.get(audiobookRecordKey(book))) preparedWidgets.delete(audiobookRecordKey(book));
    };
  }, [book, url]);
  if (!url) return null;
  return <iframe ref={iframeRef} className="audiobook-preloader" title="" width="1" height="1" loading="eager" scrolling="no" frameBorder="0" allow="autoplay; encrypted-media" aria-hidden="true" tabIndex={-1} src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&hide_related=true&show_comments=false&visual=false&show_user=false&show_reposts=false&show_teaser=false&show_artwork=false`} />;
}

function audiobookOptionLabel(title: string): string {
  const normalized = correctedCatalogTitle(title).normalize("NFKC").replace(/[၀-၉]/g, (digit) => String(digit.charCodeAt(0) - 0x1040));
  const marked = normalized.match(/\b(?:chapter|part|episode)\s*[-_:()]?\s*(\d+)\b/i)
    ?? normalized.match(/(?:အခန်း|အပိုင်း)\s*[-_:()]?\s*(\d+)/);
  if (marked) return `အခန်း ${marked[1]}`;
  const trailing = normalized.match(/(?:^|[\s._-])(\d+)\s*$/);
  return trailing ? `အခန်း ${trailing[1]}` : correctedCatalogTitle(title);
}

function AudiobookGroupCard({ group, onPlay }: { group: AudiobookCoverGroup<Audiobook>; onPlay: (book: Audiobook) => void }) {
  const [selectedKey, setSelectedKey] = useState(() => audiobookRecordKey(group.books[0]));
  const selectedBook = group.books.find((book) => audiobookRecordKey(book) === selectedKey) ?? group.books[0];
  const book = group.books[0];
  const canPlay = Boolean(selectedBook.audio_url || selectedBook.audioParts?.length || selectedBook.soundcloud_url);
  const isUploading = Boolean(selectedBook.youtube_url && !selectedBook.audio_url && !selectedBook.audioParts?.length && (selectedBook.youtubeAudioStatus === "queued" || selectedBook.youtubeAudioStatus === "running"));
  const listenLabel = canPlay ? "နားထောင်မည်" : isUploading ? "Uploading…" : "မရသေးပါ";

  useEffect(() => {
    if (!group.books.some((item) => audiobookRecordKey(item) === selectedKey)) {
      setSelectedKey(audiobookRecordKey(group.books[0]));
    }
  }, [group.books, selectedKey]);

  return <article className="audiobook-card" key={group.key}>
    <AudiobookCover book={book} coverImage={group.books.find((item) => item.coverImage)?.coverImage} />
    <div className="audiobook-card-copy"><small>{isPinnedAudiobook(book) ? "ပင်ထားသည် · အသံစာအုပ်" : isBedAungThaik(book) ? "အပေါ်ဆုံး · အသံစာအုပ်" : book.category || "အသံစာအုပ်"}</small><strong>{correctedCatalogTitle(group.title)}</strong><span>{book.author || "စာရေးသူ မသိရသေးပါ"}</span>{group.books.length > 1 && <em>{group.books.length} ခန်းပါ အသံစာအုပ်</em>}</div>
    <div className={`audiobook-track-picker${group.books.length > 1 ? " has-chapters" : ""}`}>
      {group.books.length > 1 ? <div className="audiobook-chapter-panel" aria-label={`${correctedCatalogTitle(group.title)} အခန်းများ`}>
        <div className="audiobook-chapter-list">{group.books.map((item, index) => {
          const itemKey = audiobookRecordKey(item);
          const active = itemKey === audiobookRecordKey(selectedBook);
          return <button type="button" className={`audiobook-chapter-row${active ? " active" : ""}`} key={itemKey} onClick={() => setSelectedKey(itemKey)} aria-pressed={active}>
            <span className="audiobook-chapter-number">အခန်း {String(index + 1).padStart(2, "0")}</span><span className="audiobook-chapter-name">{audiobookOptionLabel(item.title)}</span><span className="audiobook-chapter-chevron" aria-hidden="true">{active ? "●" : "›"}</span>
          </button>;
        })}</div>
      </div> : <span className="audiobook-single-track">{correctedCatalogTitle(selectedBook.title)}</span>}
      <button type="button" className={`audiobook-listen${!canPlay ? " is-unavailable" : ""}`} onClick={() => { if (canPlay) onPlay(selectedBook); }} disabled={!canPlay} aria-label={`${correctedCatalogTitle(selectedBook.title)} ${listenLabel}`}><span aria-hidden="true">{canPlay ? "▶" : isUploading ? "↻" : "–"}</span> {listenLabel}</button>
    </div>
  </article>;
}

function NativeAudiobookPlayer({ book, onClose }: { book: Audiobook; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const parts = book.audioParts?.length ? book.audioParts : (book.audio_url ? [{ url: book.audio_url, index: 0 }] : []);
  const seekingRef = useRef(false);
  const [partIndex, setPartIndex] = useState(() => { if (typeof window === "undefined") return 0; const value = Number(window.localStorage.getItem(`${audioProgressStorageKey(book)}:part`) ?? "0"); return Number.isInteger(value) && value >= 0 ? Math.min(value, Math.max(0, (book.audioParts?.length ?? 1) - 1)) : 0; });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    const savedPart = typeof window === "undefined" ? 0 : Number(window.localStorage.getItem(`${audioProgressStorageKey(book)}:part`) ?? "0");
    setPartIndex(Number.isInteger(savedPart) && savedPart >= 0 ? Math.min(savedPart, Math.max(0, parts.length - 1)) : 0);
  }, [book.id, book.slug]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !parts[partIndex]) return;
    const saved = readAudioProgress(book, window.localStorage);
    const savedPart = Number(window.localStorage.getItem(`${audioProgressStorageKey(book)}:part`) ?? "0");
    let lastPersistedSecond = -1;
    const emitProgressChange = () => window.dispatchEvent(new Event("thuthayatethar:audio-progress"));
    const onMetadata = () => { const total = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0; setDuration(total); saveAudioDuration(book, window.localStorage, total); if (savedPart === partIndex && saved?.positionMs) audio.currentTime = Math.min(saved.positionMs / 1000, audio.duration); setReady(true); void audio.play().catch(() => undefined); };
    const onTime = () => {
      if (seekingRef.current) return;
      const positionMs = audio.currentTime * 1000;
      setPosition(positionMs);
      const currentSecond = Math.floor(audio.currentTime);
      if (currentSecond !== lastPersistedSecond) {
        lastPersistedSecond = currentSecond;
        saveAudioProgress(book, window.localStorage, positionMs, duration);
        emitProgressChange();
      }
    };
    const onPlay = () => { setPlaying(true); setMediaSessionPlaybackState("playing"); };
    const onPause = () => { setPlaying(false); saveAudioProgress(book, window.localStorage, audio.currentTime * 1000, duration); emitProgressChange(); setMediaSessionPlaybackState("paused"); };
    const onEnded = () => { if (partIndex < parts.length - 1) { saveAudioProgress(book, window.localStorage, 0, 0); emitProgressChange(); window.localStorage.setItem(`${audioProgressStorageKey(book)}:part`, String(partIndex + 1)); setPartIndex((index) => index + 1); setPosition(0); setReady(false); } else { setPlaying(false); clearAudioProgress(book, window.localStorage); window.localStorage.removeItem(`${audioProgressStorageKey(book)}:part`); emitProgressChange(); setMediaSessionPlaybackState("none"); } };
    const onError = () => { setError(true); setReady(false); setMediaSessionPlaybackState("none"); };
    audio.addEventListener("loadedmetadata", onMetadata); audio.addEventListener("timeupdate", onTime); audio.addEventListener("play", onPlay); audio.addEventListener("pause", onPause); audio.addEventListener("ended", onEnded); audio.addEventListener("error", onError); audio.load();
    return () => { seekingRef.current = false; audio.pause(); audio.removeEventListener("loadedmetadata", onMetadata); audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("play", onPlay); audio.removeEventListener("pause", onPause); audio.removeEventListener("ended", onEnded); audio.removeEventListener("error", onError); setMediaSessionPlaybackState("none"); };
  }, [book, book.audio_url, book.audioParts, partIndex]);
  const shown = duration > 0 ? Math.min(position, duration) : position;
  const toggle = () => { const audio = audioRef.current; if (!audio || !ready || error) return; if (audio.paused) void audio.play().catch(() => setError(true)); else audio.pause(); };
  const seek = (value: string) => { const valueMs = Number(value); if (!audioRef.current || !Number.isFinite(valueMs)) return; audioRef.current.currentTime = valueMs / 1000; setPosition(valueMs); saveAudioProgress(book, window.localStorage, valueMs, duration); window.dispatchEvent(new Event("thuthayatethar:audio-progress")); };
  return <aside className="audiobook-dock" aria-label="အသံစာအုပ်ဖွင့်စက်">
    <audio ref={audioRef} className="audiobook-native-audio" src={parts[partIndex]?.url} preload="metadata" aria-label={`${book.title} အသံစာအုပ်`} />
    <div className="audiobook-dock-heading"><span className="audiobook-live-dot" /><span className="audiobook-dock-title"><small>ယခုနားထောင်နေသည် · AUDIO</small><strong>{book.title}</strong><span>{book.author || "တင်သူ မသိရသေးပါ"}</span></span><button type="button" onClick={onClose} className="audiobook-dock-close" aria-label="အသံဖွင့်စက်ကို ပိတ်မည်">×</button></div>
    <div className="audiobook-controls" aria-label="အသံစာအုပ်ထိန်းချုပ်မှု"><button type="button" className="audiobook-play-toggle" onClick={toggle} disabled={!ready || error} aria-label={playing ? "ခဏရပ်မည်" : "ဆက်နားထောင်မည်"}><span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span></button><input type="range" min="0" max={duration || 1} step="1000" value={shown} disabled={!ready || !duration || error} onPointerDown={() => { seekingRef.current = true; }} onPointerUp={() => { seekingRef.current = false; }} onPointerCancel={() => { seekingRef.current = false; }} onChange={(event) => seek(event.target.value)} aria-label="အသံစာအုပ်အတွင်း ဖွင့်နေသည့်နေရာ" /><span className="audiobook-time">{formatAudioTime(shown)}{duration ? ` / ${formatAudioTime(duration)}` : ""}</span></div>
    <p className="audiobook-player-status" role="status">{error ? "အသံဖိုင်ကို ဖွင့်မရပါ။" : !ready ? "အသံဖွင့်စက်ကို ပြင်ဆင်နေသည်…" : parts.length > 1 ? `အပိုင်း ${partIndex + 1} / ${parts.length} · ဆက်လက်ဖွင့်နေသည်` : "YouTube မှ ပြောင်းထားသော audio"}</p>
  </aside>;
}

export default function AudiobookPlayer({ book, onClose, preloadBooks = [] }: { book: Audiobook | null; onClose: () => void; preloadBooks?: Audiobook[] }) {
  if (book?.audio_url || book?.audioParts?.length) return <NativeAudiobookPlayer book={book} onClose={onClose} />;
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
  const [preparedRevision, setPreparedRevision] = useState(0);
  const preparedWidget = book ? preparedWidgets.get(audiobookRecordKey(book)) : null;
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
    const refreshPreparedWidgets = () => setPreparedRevision((revision) => revision + 1);
    window.addEventListener("thuthayatethar:audio-widget-ready", refreshPreparedWidgets);
    return () => window.removeEventListener("thuthayatethar:audio-widget-ready", refreshPreparedWidgets);
  }, []);

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
    if (!book || !normalizedUrl || widgetApiState !== "ready" || (!preparedWidget && (!iframeRef.current || !window.SC?.Widget))) return;
    let disposed = false;
    let lastUiUpdate = 0;
    let lastProgressSave = 0;
    const soundCloud = window.SC;
    if (!preparedWidget && !soundCloud?.Widget) return;
    const widget = preparedWidget ?? soundCloud!.Widget(iframeRef.current!);
    widgetRef.current = widget;
    const events = soundCloud?.Widget.Events ?? window.SC!.Widget.Events;
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

    const initializePlayer = () => {
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
    };
    widget.bind(events.READY, initializePlayer);
    // A preloaded iframe may already be ready before the Listen click.
    if (preparedWidget) initializePlayer();

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
  }, [book, normalizedUrl, playerSrc, widgetApiState, preparedRevision]);

  if (!book || !normalizedUrl || !playerSrc) {
    return <>{preloadBooks.map((item) => <PreparedAudiobookWidget key={audiobookRecordKey(item)} book={item} />)}</>;
  }

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
    {preloadBooks.map((item) => <PreparedAudiobookWidget key={audiobookRecordKey(item)} book={item} />)}
    {widgetApiState === "ready" && !preparedWidget && <iframe key={`${book.slug ?? book.id}:${normalizedUrl}`} ref={iframeRef} className="audiobook-engine" title={`${book.title} — SoundCloud အသံရင်းမြစ်`} width="1" height="1" loading="eager" scrolling="no" frameBorder="0" allow="autoplay; encrypted-media" aria-hidden="true" tabIndex={-1} src={playerSrc} />}
  </aside>;
}
