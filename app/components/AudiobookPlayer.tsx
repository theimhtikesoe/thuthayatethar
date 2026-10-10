"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { groupAudiobooks, type AudiobookCoverGroup } from "../audiobook-grouping";
import { clearAudioProgress, formatAudioTime, readAudioProgress, saveAudioDuration, saveAudioProgress } from "../audio-progress";

type Audiobook = {
  id: string | number;
  slug?: string;
  title: string;
  author?: string;
  category?: string;
  coverImage?: string;
  audio_url?: string;
  soundcloud_url?: string;
  youtube_url?: string;
};

function normalizeAudioUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (["youtube.com", "m.youtube.com", "youtu.be", "soundcloud.com", "on.soundcloud.com"].includes(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sourceUrl(book: Audiobook): string | null {
  return book.youtube_url || book.soundcloud_url || null;
}

function audiobookRecordKey(book: Audiobook): string {
  return String(book.slug ?? book.id);
}

const audiobookCoverPalette = [["#dbe7df", "#315a50"], ["#f0dfc8", "#80553c"], ["#d9dfef", "#485d83"], ["#eedce5", "#814d68"], ["#dce6ec", "#3d6570"], ["#e8e1ce", "#625638"]];

function audiobookCoverColors(book: Audiobook) {
  const identity = `${book.slug ?? book.id}:${book.title}`;
  const hash = Array.from(identity).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return audiobookCoverPalette[hash % audiobookCoverPalette.length];
}

function AudiobookCover({ book, coverImage }: { book: Audiobook; coverImage?: string }) {
  const candidates = Array.from(new Set([coverImage || book.coverImage].filter((value): value is string => Boolean(value))));
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
    <div className="audiobook-grid">{groups.map((group) => <AudiobookGroupCard key={group.key} group={group} onPlay={onPlay} />)}</div>
  </section>;
}


function audiobookOptionLabel(title: string): string {
  const normalized = title.normalize("NFKC").replace(/[၀-၉]/g, (digit) => String(digit.charCodeAt(0) - 0x1040));
  const marked = normalized.match(/\b(?:chapter|part|episode)\s*[-_:()]?\s*(\d+)\b/i) ?? normalized.match(/(?:အခန်း|အပိုင်း)\s*[-_:()]?\s*(\d+)/);
  if (marked) return `အပိုင်း ${marked[1]}`;
  const trailing = normalized.match(/(?:^|[\s._-])(\d+)\s*$/);
  return trailing ? `အပိုင်း ${trailing[1]}` : title;
}

function AudiobookGroupCard({ group, onPlay }: { group: AudiobookCoverGroup<Audiobook>; onPlay: (book: Audiobook) => void }) {
  const [selectedKey, setSelectedKey] = useState(() => audiobookRecordKey(group.books[0]));
  const selectedBook = group.books.find((item) => audiobookRecordKey(item) === selectedKey) ?? group.books[0];
  const book = group.books[0];
  useEffect(() => {
    if (!group.books.some((item) => audiobookRecordKey(item) === selectedKey)) setSelectedKey(audiobookRecordKey(group.books[0]));
  }, [group.books, selectedKey]);
  return <article className="audiobook-card" key={group.key}>
    <AudiobookCover book={book} coverImage={group.books.find((item) => item.coverImage)?.coverImage} />
    <div className="audiobook-card-copy"><small>{book.category || "အသံစာအုပ်"}</small><strong>{group.title}</strong><span>{book.author || "စာရေးသူ မသိရသေးပါ"}</span></div>
    <div className="audiobook-track-picker">
      {group.books.length > 1 ? <label className="audiobook-track-select"><span>အပိုင်း / ခေါင်းစဉ်ရွေးပါ</span><select value={audiobookRecordKey(selectedBook)} onChange={(event) => setSelectedKey(event.target.value)} aria-label={`${group.title} အပိုင်း သို့မဟုတ် ခေါင်းစဉ်ရွေးရန်`}>{group.books.map((item) => <option key={audiobookRecordKey(item)} value={audiobookRecordKey(item)}>{audiobookOptionLabel(item.title)}</option>)}</select></label> : <span className="audiobook-single-track">{selectedBook.title}</span>}
      <button type="button" className="audiobook-listen" onClick={() => onPlay(selectedBook)} aria-label={`${selectedBook.title} ကို နားထောင်မည်`}><span aria-hidden="true">▶</span> နားထောင်မည်</button>
    </div>
  </article>;
}

export default function AudiobookPlayer({ book, onClose }: { book: Audiobook | null; onClose: () => void; preloadBooks?: Audiobook[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const audioUrl = useMemo(() => normalizeAudioUrl(book?.audio_url), [book?.audio_url]);
  const unsupportedSource = book && !audioUrl ? sourceUrl(book) : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!book || !audioUrl || !audio) return;
    const saved = readAudioProgress(book, window.localStorage);
    setIsPlaying(false); setPlayerReady(false); setPlayerError(false); setPositionMs(saved?.positionMs ?? 0); setDurationMs(saved?.durationMs ?? 0);
    positionRef.current = saved?.positionMs ?? 0; durationRef.current = saved?.durationMs ?? 0;
    audio.currentTime = saved?.positionMs ? saved.positionMs / 1000 : 0;
    const persist = () => { const position = audio.currentTime * 1000; positionRef.current = position; setPositionMs(position); saveAudioProgress(book, window.localStorage, position, durationRef.current); window.dispatchEvent(new Event("thuthayatethar:audio-progress")); };
    const onLoadedMetadata = () => { durationRef.current = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0; setDurationMs(durationRef.current); saveAudioDuration(book, window.localStorage, durationRef.current); setPlayerReady(true); if (positionRef.current > 0) audio.currentTime = Math.min(positionRef.current / 1000, audio.duration); void audio.play().catch(() => undefined); };
    const onTimeUpdate = () => { const position = audio.currentTime * 1000; positionRef.current = position; setPositionMs(position); };
    const onPlay = () => { setIsPlaying(true); setMediaSessionPlaybackState("playing"); };
    const onPause = () => { setIsPlaying(false); setMediaSessionPlaybackState("paused"); persist(); };
    const onEnded = () => { setIsPlaying(false); setMediaSessionPlaybackState("none"); clearAudioProgress(book, window.localStorage); positionRef.current = 0; setPositionMs(0); window.dispatchEvent(new Event("thuthayatethar:audio-progress")); };
    const onError = () => { setPlayerError(true); setPlayerReady(false); setMediaSessionPlaybackState("none"); };
    audio.addEventListener("loadedmetadata", onLoadedMetadata); audio.addEventListener("timeupdate", onTimeUpdate); audio.addEventListener("play", onPlay); audio.addEventListener("pause", onPause); audio.addEventListener("ended", onEnded); audio.addEventListener("error", onError); audio.addEventListener("canplay", () => setPlayerReady(true));
    audio.load();
    return () => { persist(); audio.pause(); audio.removeEventListener("loadedmetadata", onLoadedMetadata); audio.removeEventListener("timeupdate", onTimeUpdate); audio.removeEventListener("play", onPlay); audio.removeEventListener("pause", onPause); audio.removeEventListener("ended", onEnded); audio.removeEventListener("error", onError); setMediaSessionPlaybackState("none"); };
  }, [book, audioUrl]);

  useEffect(() => { document.body.classList.toggle("audiobook-playing", Boolean(book)); return () => document.body.classList.remove("audiobook-playing"); }, [book]);
  useEffect(() => {
    if (!book || !audioUrl || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    const session = navigator.mediaSession; session.metadata = new MediaMetadata({ title: book.title, artist: book.author || "သုတရိပ်သာ", album: "သုတရိပ်သာ · အသံစာအုပ်" });
    try { session.setActionHandler("play", () => void audioRef.current?.play()); session.setActionHandler("pause", () => audioRef.current?.pause()); session.setActionHandler("seekbackward", () => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15); }); session.setActionHandler("seekforward", () => { if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || Infinity, audioRef.current.currentTime + 30); }); } catch { /* Unsupported Media Session action. */ }
    return () => { try { session.metadata = null; session.playbackState = "none"; session.setActionHandler("play", null); session.setActionHandler("pause", null); session.setActionHandler("seekbackward", null); session.setActionHandler("seekforward", null); } catch { /* Ignore cleanup errors. */ } };
  }, [book?.slug, book?.id, book?.title, book?.author, audioUrl]);

  if (!book) return null;
  const togglePlayback = () => { const audio = audioRef.current; if (!audio || !playerReady || playerError) return; if (audio.paused) void audio.play().catch(() => setPlayerError(true)); else audio.pause(); };
  const seekTo = (value: string) => { const position = Number(value); if (!Number.isFinite(position) || !audioRef.current) return; audioRef.current.currentTime = position / 1000; setPositionMs(position); saveAudioProgress(book, window.localStorage, position, durationRef.current); };
  const displayedPosition = durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs;
  const sourceLabel = book.youtube_url ? "YouTube မူရင်းစာမျက်နှာကို ဖွင့်မည်" : "SoundCloud မူရင်းစာမျက်နှာကို ဖွင့်မည်";
  return <aside className="audiobook-dock" aria-label="အသံစာအုပ်ဖွင့်စက်">
    {audioUrl && <audio ref={audioRef} className="audiobook-native-audio" src={audioUrl} preload="metadata" aria-label={`${book.title} အသံစာအုပ်`} />}
    <div className="audiobook-dock-heading"><span className="audiobook-live-dot" /><span className="audiobook-dock-title"><small>ယခုနားထောင်နေသည် · AUDIO</small><strong>{book.title}</strong><span>{book.author || "တင်သူ မသိရသေးပါ"}</span></span>{unsupportedSource && <a href={unsupportedSource} target="_blank" rel="noreferrer" className="audiobook-open-source">မူရင်း ↗</a>}<button type="button" onClick={onClose} className="audiobook-dock-close" aria-label="အသံဖွင့်စက်ကို ပိတ်မည်">×</button></div>
    {audioUrl ? <>
      <div className="audiobook-controls" aria-label="အသံစာအုပ်ထိန်းချုပ်မှု"><button type="button" className="audiobook-play-toggle" onClick={togglePlayback} disabled={!playerReady || playerError} aria-label={isPlaying ? "ခဏရပ်မည်" : "ဆက်နားထောင်မည်"}><span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span></button><input type="range" min="0" max={durationMs || 1} step="1000" value={displayedPosition} disabled={!playerReady || durationMs <= 0 || playerError} onChange={(event) => seekTo(event.target.value)} aria-label="အသံစာအုပ်အတွင်း ဖွင့်နေသည့်နေရာ" /><span className="audiobook-time" aria-live="off">{formatAudioTime(displayedPosition)}{durationMs > 0 ? ` / ${formatAudioTime(durationMs)}` : ""}</span></div>
      {(playerError || !playerReady) && <p className="audiobook-player-status" role="status">{playerError ? "အသံဖိုင်ကို ဖွင့်မရပါ။ URL နှင့် ဖိုင်ခွင့်ပြုချက်ကို စစ်ပါ။" : "အသံဖွင့်စက်ကို ပြင်ဆင်နေသည်…"}</p>}
    </> : <p className="audiobook-player-status audiobook-source-required" role="status">YouTube/SoundCloud စာမျက်နှာ link သာရှိပါသည်။ Native audio ဖွင့်ရန် admin မှ တိုက်ရိုက် MP3, M4A, OGG သို့မဟုတ် WAV URL ထည့်ပေးရန်လိုအပ်ပါသည်။</p>}
  </aside>;
}

function setMediaSessionPlaybackState(state: "none" | "paused" | "playing") {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try { navigator.mediaSession.playbackState = state; } catch { /* Unsupported Media Session state. */ }
}
