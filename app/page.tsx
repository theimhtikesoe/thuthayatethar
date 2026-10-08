"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";

const FlipBook = dynamic(() => import("./FlipBook"), { ssr: false });

type Rights = "full" | "summary";
type Theme = "paper" | "sepia" | "night";

type Book = {
  id: number;
  title: string;
  author: string;
  category: string;
  year: string;
  readingTime: number;
  pages: string[];
  summary: string;
  color: string;
  accent: string;
  mark: string;
  rights: Rights;
  tag: string;
  pdfUrl?: string;
  coverImage?: string;
  externalUrl?: string;
  sourceType?: string;
  slug?: string;
};

const books: Book[] = [
  {
    id: 1,
    title: "မိုးရေထဲက လမ်းလျှောက်သူ",
    author: "မေမြို့မင်း",
    category: "ဝတ္ထု",
    year: "၂၀၂၄",
    readingTime: 18,
    color: "#cad7d3",
    accent: "#264e4b",
    mark: "MM",
    tag: "အယ်ဒီတာရွေးချယ်မှု",
    rights: "full",
    summary: "မိုးရာသီတစ်ခုအတွင်း မြို့ဟောင်းလေးတစ်မြို့၏ လမ်းသွယ်များ၊ လူငယ်တစ်ယောက်၏ အိပ်မက်နှင့် မိသားစုအမှတ်တရများကို နူးညံ့စွာ ချိတ်ဆက်ထားသည့် ခေတ်ပြိုင်ဝတ္ထုတို။",
    pages: [
      "မိုးစက်တွေဟာ တစ်မြို့လုံးရဲ့ အသံတွေကို ဖုံးအုပ်ထားတယ်။ လမ်းမကြီးက ကားသံတွေ၊ ဆိုင်ရှေ့က ရယ်သံတွေ၊ အိမ်တံခါးပိတ်သံတွေက မိုးရဲ့ တိတ်ဆိတ်မှုထဲမှာ ပျော်ဝင်သွားကြတယ်။",
      "သူက ထီးမဆောင်းဘဲ လမ်းလျှောက်လာတယ်။ လက်ထဲမှာတော့ မဖွင့်ရသေးတဲ့ စာအုပ်တစ်အုပ်နဲ့ အမေ့ရဲ့ လက်ရေးနဲ့ရေးထားတဲ့ လိပ်စာတစ်ကြောင်း။ လမ်းဆုံးမှာ ဘာရှိမလဲ မသိပေမယ့် ပြန်လှည့်ဖို့တော့ မစဉ်းစားတော့ဘူး။",
      "နေ့လယ်မိုးရေက စိတ်ထဲမှာ ကျန်နေတဲ့ အဟောင်းတွေကို ဆေးကြောသွားသလိုပါပဲ။ နေရာဟောင်းတွေကို ဖြတ်သွားရင်း သူဟာ ကိုယ့်ကိုယ်ကိုယ် ပြန်တွေ့လာတယ်။"
    ]
  },
  {
    id: 2,
    title: "လေညင်းက ပြောသောစကား",
    author: "ခင်မမ",
    category: "ကဗျာ",
    year: "၂၀၂၃",
    readingTime: 8,
    color: "#e5c6b2",
    accent: "#8a4f3d",
    mark: "KK",
    tag: "ကဗျာစုစည်းမှု",
    rights: "full",
    summary: "လေညင်း၊ အိမ်ပြန်ချိန်နှင့် မပြောဖြစ်ခဲ့သော စကားများကို အဓိကထားသည့် ကဗျာတိုများ စုစည်းမှု။ ရိုးရှင်းသော စကားလုံးများထဲတွင် မြို့ပြဘဝ၏ နူးညံ့မှုကို ရှာတွေ့နိုင်သည်။",
    pages: [
      "လေညင်းက ပြောတယ် —\nမင်းမကြားခဲ့တဲ့ စကားတွေဟာ\nအရွက်တွေကြားမှာ မပျောက်သေးဘူး။",
      "အိမ်ပြန်ချိန်ဆိုတာ\nလမ်းတစ်လျှောက်က အလင်းရောင်တွေကို\nကိုယ့်အတွင်းထဲ ပြန်သယ်လာရတဲ့ အချိန်။",
      "မပြောဖြစ်ခဲ့တဲ့ စကားတွေကို\nညနေခင်းရဲ့ အေးမြမှုနဲ့ ထုပ်ပိုးပြီး\nမနက်ဖြန်ဆီ ပို့လိုက်တယ်။"
    ]
  },
  {
    id: 3,
    title: "မြစ်နှစ်စင်းကြားက ရွာ",
    author: "လင်းယုန်",
    category: "သမိုင်းဝတ္ထု",
    year: "၂၀၂၂",
    readingTime: 32,
    color: "#d6c6a9",
    accent: "#655139",
    mark: "LY",
    tag: "လူကြိုက်များ",
    rights: "full",
    summary: "မြစ်နှစ်စင်းကြားတွင် တည်ရှိသော ရွာငယ်တစ်ရွာ၏ မျိုးဆက်သုံးဆက် အကြောင်းကို သမိုင်းမှတ်တမ်းများနှင့် လူ့ဘဝအလွမ်းတို့ဖြင့် ရေးဖွဲ့ထားသည်။",
    pages: [
      "ရွာက မြစ်နှစ်စင်းကြားမှာ ရှိတယ်။ နွေရာသီရောက်ရင် ရေက တိတ်ဆိတ်သွားပြီး ဆောင်းရာသီမှာတော့ မြစ်ရဲ့ အသံက အိမ်တိုင်းထဲအထိ ဝင်လာတတ်တယ်။",
      "အဖိုးက အမြဲပြောတယ် — ရွာတစ်ရွာရဲ့ သမိုင်းဟာ စာအုပ်ထဲမှာပဲ မရှိဘူး၊ လူတွေရဲ့ လက်ဖဝါးမှာလည်း ရှိတယ်တဲ့။",
      "နှစ်တွေကြာလာတော့ မြစ်က လမ်းကြောင်းပြောင်းသွားတယ်။ ရွာကတော့ မပြောင်းဘဲ အမှတ်တရတွေကို ရေစီးနဲ့အတူ ထိန်းသိမ်းထားတယ်။"
    ]
  },
  {
    id: 4,
    title: "နေ့တစ်နေ့ကို နားလည်ခြင်း",
    author: "သက်ပိုင်",
    category: "အက်ဆေး",
    year: "၂၀၂၅",
    readingTime: 12,
    color: "#c7d4e5",
    accent: "#38567b",
    mark: "TP",
    tag: "အသစ်ထွက်",
    rights: "full",
    summary: "မနက်ခင်းကော်ဖီတစ်ခွက်၊ ဘတ်စ်ကားစောင့်နေချိန်နှင့် ညအိပ်ရာဝင်မတိုင်မီ စိတ်ထဲဖြတ်သန်းသွားသည့် အတွေးများကို ပြန်လည်ကြည့်ရှုစေသော အက်ဆေးများ။",
    pages: [
      "နေ့တစ်နေ့ဟာ အလုပ်စာရင်းတစ်ခုထက် ပိုပြီး ကျယ်ဝန်းတယ်။ မျက်နှာချင်းဆိုင်တွေ့တဲ့ လူတစ်ယောက်ရဲ့ အပြုံး၊ ပြတင်းပေါက်က ဝင်လာတဲ့ အလင်းဟာလည်း ဒီနေ့ရဲ့ အစိတ်အပိုင်းပဲ။",
      "အလျင်လိုနေတဲ့အခါ အချိန်ဟာ ပိုမြန်သွားတာမဟုတ်ဘူး။ ကိုယ်ကြည့်ဖို့ မေ့နေတဲ့ အသေးစိတ်တွေကပဲ ဝေးသွားတာ။",
      "ဒါကြောင့် ဒီနေ့ကို နားလည်ဖို့ မနက်ဖြန်အထိ မစောင့်ပါနဲ့။ ဒီနေ့မှာပဲ ဒီနေ့ကို ကြည့်ပါ။"
    ]
  },
  {
    id: 5,
    title: "တောင်ပေါ်မြို့ရဲ့ ညများ",
    author: "မြတ်နိုး",
    category: "ဝတ္ထု",
    year: "၂၀၂၁",
    readingTime: 24,
    color: "#b9c8d1",
    accent: "#334d62",
    mark: "MN",
    tag: "ညစာဖတ်ရန်",
    rights: "full",
    summary: "တောင်ပေါ်မြို့တစ်မြို့၏ အေးမြသောညများထဲတွင် သူစိမ်းနှစ်ယောက် မျှဝေလိုက်သော အိပ်မက်နှင့် မေးခွန်းများအကြောင်း။",
    pages: [
      "တောင်ပေါ်မြို့တွေမှာ ညက မြန်မြန်ကျတယ်။ အလင်းရောင်နည်းလေလေ လူတွေက ကိုယ့်စိတ်ထဲက အသံတွေကို ပိုရှင်းရှင်းကြားရလေလေပါပဲ။",
      "သူတို့နှစ်ယောက်က လက်ဖက်ရည်ဆိုင်အပြင်ဘက်မှာ ထိုင်ပြီး မြို့အောက်က မီးလုံးတွေကို ကြည့်နေကြတယ်။ တစ်ယောက်က မေးတယ် — မင်းဘယ်ကို သွားချင်တာလဲ။",
      "အဖြေမရှိတဲ့ မေးခွန်းတချို့ဟာလည်း လူကို ခရီးထွက်စေတတ်တယ်။"
    ]
  },
  {
    id: 6,
    title: "တောရိုင်းပန်းများ၏ ရာသီ",
    author: "မိုးခိုင်",
    category: "လူငယ်",
    year: "၂၀၂၅",
    readingTime: 14,
    color: "#e0c4cf",
    accent: "#7b405d",
    mark: "MK",
    tag: "လူငယ်ရွေးချယ်မှု",
    rights: "full",
    summary: "ကျောင်းပြီးခါစ သူငယ်ချင်းသုံးယောက်၏ ရွေးချယ်မှုများ၊ သတ္တိနှင့် အနာဂတ်အကြောင်း ရယ်စရာနူးညံ့မှုများဖြင့် ဖတ်ရလွယ်ကူအောင် ရေးထားသော ဝတ္ထု။",
    pages: [
      "တောရိုင်းပန်းတွေက ဘယ်သူစိုက်ထားတာမှ မဟုတ်ပေမယ့် သူတို့ရဲ့ ရာသီရောက်ရင် ပွင့်ကြတယ်။ ကျွန်မတို့လည်း အဲဒီလိုပဲလို့ သူက ပြောတယ်။",
      "သူငယ်ချင်းသုံးယောက်ဟာ မြို့ရဲ့ အစွန်ဆုံးလမ်းက ခုံတန်းလေးပေါ်မှာ အနာဂတ်ကို ခွဲဝေပြီး စိတ်ကူးယဉ်နေကြတယ်။",
      "မသေချာတာတွေ ရှိနေပေမယ့် တစ်ယောက်နဲ့တစ်ယောက် ရှိနေသရွေ့ ခရီးက မကြောက်စရာဘူး။"
    ]
  },
  {
    id: 7,
    title: "အလင်းရောင်ကို စောင့်သူ",
    author: "ဦးသိန်းလွင်",
    category: "သုတ",
    year: "၂၀၂၀",
    readingTime: 20,
    color: "#d5d0c2",
    accent: "#5d5844",
    mark: "TL",
    tag: "အတွေးစာ",
    rights: "summary",
    summary: "အလင်းရောင်၊ မျှော်လင့်ချက်နှင့် လူမှုဘဝအကြောင်း ရေးသားထားသော စာအုပ်ဖြစ်သော်လည်း လက်ရှိအချိန်တွင် အကျဉ်းချုပ်နှင့် metadata များကိုသာ ဖတ်ရှုခွင့်ပြုထားသည်။",
    pages: []
  },
  {
    id: 8,
    title: "စာရွက်ဖြူပေါ်က မှတ်စုများ",
    author: "ဆုမြတ်",
    category: "အက်ဆေး",
    year: "၂၀၁၉",
    readingTime: 10,
    color: "#d7c7ba",
    accent: "#795c4c",
    mark: "SM",
    tag: "စာရေးနည်း",
    rights: "summary",
    summary: "ရေးချင်စိတ်၊ မရေးဖြစ်သေးသော မှတ်စုများနှင့် စာရေးသူတစ်ယောက်၏ နေ့စဉ်အကျင့်များကို စုစည်းထားသော စာအုပ်။ မူပိုင်ခွင့်အခြေအနေကြောင့် အကျဉ်းချုပ်သာ ရရှိနိုင်သည်။",
    pages: []
  }
];

const categories = ["အားလုံး", "ဝတ္ထု", "ကဗျာ", "သမိုင်းဝတ္ထု", "အက်ဆေး", "လူငယ်", "သုတ"];
const times = ["အားလုံး", "၁၅ မိနစ်အောက်", "၁၅–၂၅ မိနစ်", "၂၅ မိနစ်အထက်"];
const coverPalette = [
  ["#cad7d3", "#264e4b"], ["#e5c6b2", "#8a4f3d"], ["#d6c6a9", "#655139"],
  ["#c7d4e5", "#38567b"], ["#b9c8d1", "#334d62"], ["#e0c4cf", "#7b405d"],
  ["#d5d0c2", "#5d5844"], ["#d7c7ba", "#795c4c"],
];

function readingProgressKey(book: Book) {
  return `thuthayatethar:progress:${book.slug ?? book.id}`;
}

function getReadingProgress(book: Book) {
  try {
    const page = Number(localStorage.getItem(readingProgressKey(book)));
    const maxPage = book.pages.length ? book.pages.length - 1 : Number.MAX_SAFE_INTEGER;
    return Number.isInteger(page) && page >= 0 ? Math.min(page, maxPage) : 0;
  } catch { return 0; }
}

function matchesTime(minutes: number, time: string) {
  if (time === "၁၅ မိနစ်အောက်") return minutes < 15;
  if (time === "၁၅–၂၅ မိနစ်") return minutes >= 15 && minutes <= 25;
  if (time === "၂၅ မိနစ်အထက်") return minutes > 25;
  return true;
}

export default function HomePage() {
  const [catalogBooks, setCatalogBooks] = useState<Book[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("အားလုံး");
  const [time, setTime] = useState("အားလုံး");
  const [selected, setSelected] = useState<Book | null>(null);
  const [readerBook, setReaderBook] = useState<Book | null>(null);
  const [page, setPage] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => { if (typeof window === "undefined") return "paper"; const saved = localStorage.getItem("thuthayatethar:reader-theme"); return saved === "sepia" || saved === "night" ? saved : "paper"; });
  const [fontScale, setFontScale] = useState(1);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [offlinePackState, setOfflinePackState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [offlinePackProgress, setOfflinePackProgress] = useState(0);
  useEffect(() => { localStorage.setItem("thuthayatethar:reader-theme", theme); }, [theme]);

  useEffect(() => {
    const cached = localStorage.getItem("thuthayatethar:catalog");
    if (cached) { try { setCatalogBooks(JSON.parse(cached)); } catch {} }
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { ok?: boolean; configured?: boolean; books?: Array<Partial<Book> & { id?: string | number; pages?: string[]; pdfUrl?: string }> }) => {
        if (payload.ok !== true || payload.configured === false || !Array.isArray(payload.books)) { if (!cached) setCatalogBooks([]); return; }
        const nextBooks: Book[] = payload.books.map((book, index) => ({
          id: typeof book.id === "number" ? book.id : index + 1,
          title: book.title ?? "စာအုပ်အသစ်",
          author: book.author ?? "မသိရသေးသော စာရေးသူ",
          category: book.category ?? "အခြား",
          year: book.year ?? "—",
          readingTime: book.readingTime ?? 10,
          pages: book.pages ?? [],
          summary: book.summary ?? "",
          color: book.color ?? coverPalette[index % coverPalette.length][0],
          accent: book.accent ?? coverPalette[index % coverPalette.length][1],
          mark: book.mark ?? "စာ",
          rights: book.rights === "summary" ? "summary" as Rights : "full" as Rights,
          tag: book.tag ?? "ထုတ်ဝေထားသည်",
          pdfUrl: book.slug ? `/api/books/${encodeURIComponent(book.slug)}/pdf` : book.pdfUrl,
          coverImage: book.coverImage ? (book.slug ? `/api/books/${encodeURIComponent(book.slug)}/cover` : book.coverImage) : undefined,
          externalUrl: book.externalUrl,
          sourceType: book.sourceType,
          slug: book.slug,
        }));
        setCatalogBooks(nextBooks);
        localStorage.setItem("thuthayatethar:catalog", JSON.stringify(nextBooks));
      })
      .catch(() => { if (!cached) setCatalogBooks([]); })
      .finally(() => setCatalogLoading(false));
  }, []);
  useEffect(() => {
    const slug = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("read");
    if (!slug || !catalogBooks) return;
    const book = catalogBooks.find((item) => item.slug === slug);
    if (book) { setReaderBook(book); setPage(getReadingProgress(book)); document.body.classList.add("reader-open"); }
  }, [catalogBooks]);

  const availableBooks = catalogBooks ?? [];
  const downloadableBooks = availableBooks.filter((book) => book.rights === "full" && Boolean(book.pdfUrl));

  async function saveOfflinePack() {
    if (!("caches" in window) || !downloadableBooks.length) return;
    setOfflinePackState("saving");
    setOfflinePackProgress(0);
    let failed = false;
    try {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
      const cache = await caches.open("thuthayatethar-books-v2");
      const shell = await caches.open("thuthayatethar-shell-v2");
      await shell.addAll(["/", "/manifest.webmanifest", "/logo.svg", "/pdf.worker.min.js"]);
      for (let index = 0; index < downloadableBooks.length; index += 1) {
        const book = downloadableBooks[index];
        try {
          const response = await fetch(book.pdfUrl!, { cache: "no-store" });
          if (!response.ok) throw new Error("offline_pack_pdf_failed");
          await cache.put(book.pdfUrl!, response.clone());
          if (book.coverImage) {
            const coverResponse = await fetch(book.coverImage, { cache: "no-store" });
            if (coverResponse.ok) await cache.put(book.coverImage, coverResponse.clone());
          }
        } catch { failed = true; }
        setOfflinePackProgress(index + 1);
      }
      setOfflinePackState(failed ? "error" : "done");
    } catch {
      setOfflinePackState("error");
    }
  }

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return availableBooks.filter((book) => {
      const haystack = `${book.title} ${book.author} ${book.category} ${book.summary} ${book.tag}`.toLowerCase();
      return (!normalized || haystack.includes(normalized)) &&
        (category === "အားလုံး" || book.category === category) &&
        (time === "အားလုံး" || matchesTime(book.readingTime, time));
    });
  }, [availableBooks, category, query, time]);

  useEffect(() => {
    const stopReaderActions = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ["c", "p", "s", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", stopReaderActions);
    return () => window.removeEventListener("keydown", stopReaderActions);
  }, []);

  const openReader = (book: Book) => {
    if (book.rights !== "full") return;
    setSelected(null);
    setReaderBook(book);
    setPage(getReadingProgress(book));
    window.history.replaceState(null, "", `#read=${encodeURIComponent(book.slug ?? String(book.id))}`);
    document.body.classList.add("reader-open");
  };

  useEffect(() => {
    if (!readerBook || readerBook.pages.length === 0) return;
    try { localStorage.setItem(readingProgressKey(readerBook), String(page)); } catch { /* Storage may be disabled. */ }
  }, [readerBook, page]);

  const closeReader = () => {
    setReaderBook(null);
    window.history.replaceState(null, "", "#catalog");
    document.body.classList.remove("reader-open");
  };

  const resetFilters = () => {
    setQuery("");
    setCategory("အားလုံး");
    setTime("အားလုံး");
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="သုတရိပ်သာ ပင်မစာမျက်နှာ">
          <span className="brand-mark"><span></span><span></span></span>
          <span><strong>သုတရိပ်သာ</strong><small>မြန်မာစာအုပ်များအတွက် ဒစ်ဂျစ်တယ်ရိပ်သာ</small></span>
        </a>
        <nav className="topnav" aria-label="အဓိကမီနူး">
          <a className="active" href="#catalog">စာအုပ်များ</a>
          <a href="#about">အကြောင်း</a>
          <button className="quiet-button" type="button" onClick={() => setSelected(books[0])}>ဒီနေ့ဖတ်ရန် <span>↗</span></button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot"></span> မြန်မာစာပေ စုစည်းရာ</p>
          <h1>ဖတ်ချင်စိတ်ကို<br /><em>ဒီမှာ</em> စတင်ပါ</h1>
          <p className="hero-intro">စာမျက်နှာတစ်မျက်နှာချင်းစီမှာ အေးဆေးတဲ့အချိန်တစ်ခု ရှိနေတယ်။ စာအုပ်ကောင်းတွေကို ရှာဖွေပြီး ကိုယ့်ရဲ့နေ့ရက်ထဲမှာ နေရာပေးလိုက်ပါ။</p>
          <div className="hero-actions">
            <a className="primary-button" href="#catalog">စာအုပ်များကြည့်မည် <span>↓</span></a>
            <span className="hero-note">မူပိုင်ခွင့်ခွင့်ပြုချက်ရှိသော<br />အကြောင်းအရာများကိုသာ ဖတ်ရှုနိုင်သည်</span>
          </div>
        </div>
        <div className="hero-visual" aria-label="စာအုပ်ဖွင့်ထားသော ပုံရိပ်">
          <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div>
          <div className="hero-book hero-book-back"><span>စာဖတ်ခြင်း<br />ဟာ ခရီးတစ်ခု</span></div>
          <div className="hero-book hero-book-main"><div className="hero-book-line"></div><strong>သုတ<br />ရိပ်သာ</strong><small>စာမျက်နှာတွေကြားက<br />ငြိမ်သက်မှု</small><i>✦</i></div>
          <div className="book-caption"><span>01</span><p>ယနေ့အတွက် စာအုပ်တစ်အုပ်<br /><b>လမ်းလျှောက်ရင်း ဖတ်မလား?</b></p></div>
        </div>
      </section>

      <section className="collection-intro" id="about">
        <div><p className="eyebrow">ကျွန်ုပ်တို့ရဲ့ ရည်ရွယ်ချက်</p><h2>စာအုပ်တစ်အုပ်က<br />အချိန်တစ်ခုကို <em>ပေးတယ်</em></h2></div>
        <p className="collection-copy">သုတရိပ်သာမှာ မြန်မာစာရေးဆရာတွေရဲ့ အသံတွေ၊ ဇာတ်လမ်းတွေ၊ အတွေးတွေကို စုစည်းထားပါတယ်။ အလျင်မလိုဘဲ ရှာဖွေပါ။ ကိုယ့်စိတ်နဲ့ ကိုက်ညီတဲ့ စာအုပ်ကိုတွေ့တဲ့အခါ စာမျက်နှာကို ဖြည်းဖြည်းဖွင့်ပါ။</p>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading"><div><p className="eyebrow">စာကြည့်တိုက်</p><h2>ဒီနေ့ ဖတ်စရာများ</h2></div><div className="catalog-actions"><span className="result-count">{filteredBooks.length} အုပ် ရှာတွေ့သည်</span><button type="button" className="offline-pack-button" onClick={saveOfflinePack} disabled={offlinePackState === "saving" || !downloadableBooks.length}>{offlinePackState === "saving" ? `Offline သိမ်းနေသည် ${offlinePackProgress}/${downloadableBooks.length}` : offlinePackState === "done" ? "✓ Offline အသင့်" : "Offline အားလုံးသိမ်းမည်"}</button>{offlinePackState === "error" && <small className="offline-pack-error">အချို့စာအုပ်များ မသိမ်းနိုင်ပါ။ Internet ကို စစ်ပါ။</small>}</div></div>
        <div className="catalog-layout">
          <aside className="filters" aria-label="စာအုပ်စစ်ထုတ်မှုများ">
            <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="စာအုပ်ရှာရန်..." aria-label="စာအုပ်ရှာရန်" /><kbd>⌘ K</kbd></label>
            <div className="filter-block"><p>အမျိုးအစား</p>{categories.map((item) => <button type="button" key={item} className={category === item ? "filter-pill selected" : "filter-pill"} onClick={() => setCategory(item)}>{item}<span>{item === "အားလုံး" ? availableBooks.length : availableBooks.filter((book) => book.category === item).length}</span></button>)}</div>
            <div className="filter-block"><p>ဖတ်ရှုချိန်</p>{times.map((item) => <button type="button" key={item} className={time === item ? "filter-pill selected" : "filter-pill"} onClick={() => setTime(item)}>{item}</button>)}</div>
            {(query || category !== "အားလုံး" || time !== "အားလုံး") && <button type="button" className="reset-button" onClick={resetFilters}>စစ်ထုတ်မှုများ ရှင်းမည် ↺</button>}
            <div className="rights-note"><span>✓</span><div><strong>ဖတ်ရှုရန်သီးသန့်</strong><small>PDF ဖိုင်ကို download မလုပ်နိုင်ပါ၊ browser ထဲ offline ဖတ်ရန် သိမ်းနိုင်သည်။</small></div></div>
          </aside>
          <div className="book-grid" aria-live="polite">
            {catalogLoading && <div className="empty-state"><span>…</span><h3>စာအုပ်များကို ရယူနေသည်</h3><p>နောက်ဆုံး catalog ကို ခဏစောင့်ပေးပါ။</p></div>}
            {!catalogLoading && filteredBooks.map((book, index) => <BookCard key={book.id} book={book} index={index} onOpen={() => book.rights === "full" && !book.externalUrl ? openReader(book) : setSelected(book)} />)}
            {!catalogLoading && !filteredBooks.length && <div className="empty-state"><span>⌁</span><h3>ဒီလိုစာအုပ် မတွေ့သေးပါ</h3><p>လက်ရှိ Website catalog ထဲမှာ ထုတ်ဝေထားသောစာအုပ် မရှိသေးပါ။</p><button className="primary-button" type="button" onClick={resetFilters}>အားလုံးပြန်ကြည့်မည်</button></div>}
          </div>
        </div>
      </section>

      <footer className="footer"><div className="footer-brand"><span className="brand-mark"><span></span><span></span></span><strong>သုတရိပ်သာ</strong></div><p>မြန်မာစာပေကို အေးဆေးစွာ ဖတ်ရှုရန်။</p><span className="footer-right">© ၂၀၂၅ · Read only library</span></footer>

      {selected && <BookDetail book={selected} onClose={() => setSelected(null)} onRead={() => openReader(selected)} />}
      {readerBook && <Reader book={readerBook} page={page} setPage={setPage} theme={theme} setTheme={setTheme} fontScale={fontScale} setFontScale={setFontScale} lineHeight={lineHeight} setLineHeight={setLineHeight} onClose={closeReader} />}
    </main>
  );
}

function BookCard({ book, index, onOpen }: { book: Book; index: number; onOpen: () => void }) {
  return <article className="book-card" style={{ "--book-color": book.color, "--book-accent": book.accent, "--index": index } as CSSProperties}>
    <button type="button" className="cover-wrap" onClick={onOpen} aria-label={`${book.title} အသေးစိတ်ကြည့်ရန်`}>
      <BookCover book={book} label={String(index + 1).padStart(2, "0")} />
      {book.rights === "summary" && <span className="summary-ribbon">အကျဉ်းချုပ်သာ</span>}
    </button>
    <div className="book-meta"><div><p className="book-category">{book.category} <span>·</span> {book.year}</p><h3>{book.title}</h3><p className="book-author">{book.author}</p>{book.externalUrl && <small className="external-source-label">Wattpad မူရင်းစာမျက်နှာမှ ဖတ်ရှုရန်</small>}</div><button className="round-arrow" type="button" onClick={onOpen} aria-label="အသေးစိတ်ကြည့်ရန်">↗</button></div>
    <div className="book-stats"><span>{book.externalUrl ? "Wattpad မူရင်း link" : `◷ ${book.readingTime} မိနစ်`}</span><span className={book.externalUrl ? "rights-summary" : book.rights === "full" ? "rights-full" : "rights-summary"}>{book.externalUrl ? "မူရင်းမှာဖတ်မည်" : book.rights === "full" ? "ဖတ်ရှုနိုင်သည်" : "အကျဉ်းချုပ်"}</span></div>
  </article>;
}

function BookCover({ book, label }: { book: Book; label: string }) {
  const [pdfCover, setPdfCover] = useState<string | null>(null);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const usePdfCover = !book.coverImage || coverImageFailed;
  useEffect(() => {
    setCoverImageFailed(false);
    setPdfCover(null);
  }, [book.coverImage, book.pdfUrl]);
  useEffect(() => {
    if (!usePdfCover || !book.pdfUrl) return;
    let active = true;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
        const pdf = await pdfjs.getDocument({ url: book.pdfUrl, withCredentials: false, disableAutoFetch: true, disableStream: false }).promise;
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1.25, 900 / base.width) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        if (active) setPdfCover(canvas.toDataURL("image/jpeg", 0.82));
        await pdf.destroy();
      } catch { /* Keep the colored cover fallback if the PDF cannot be opened. */ }
    })();
    return () => { active = false; };
  }, [book.pdfUrl, usePdfCover]);
  const backgroundImage = usePdfCover ? pdfCover : book.coverImage;
  return <div className="book-cover" style={backgroundImage ? { backgroundImage: `linear-gradient(rgba(23,33,43,.25),rgba(23,33,43,.25)), url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{book.coverImage && <img className="cover-image-probe" src={book.coverImage} onError={() => setCoverImageFailed(true)} alt="" aria-hidden="true" />}{usePdfCover && !pdfCover && book.pdfUrl && <span className="cover-loading">…</span>}<span className="cover-number">{label}</span><span className="cover-mark">{book.mark}</span><strong>{book.title}</strong><small>{book.author}</small><i>✦</i></div>;
}

function BookDetail({ book, onClose, onRead }: { book: Book; onClose: () => void; onRead: () => void }) {
  return <div className="overlay" role="dialog" aria-modal="true" aria-label="စာအုပ်အသေးစိတ်"><div className="detail-panel">
    <button className="close-button" type="button" onClick={onClose} aria-label="ပိတ်မည်">×</button>
    <div className="detail-cover" style={{ "--book-color": book.color, "--book-accent": book.accent } as CSSProperties}><BookCover book={book} label={book.year} /></div>
    <div className="detail-content"><p className="eyebrow">{book.externalUrl ? "WATTPAD မူရင်း" : book.tag}</p><h2>{book.title}</h2><p className="detail-author">{book.author}</p><div className="detail-facts"><span><b>အမျိုးအစား</b>{book.category}</span><span><b>ဖတ်ရှုချိန်</b>{book.readingTime} မိနစ်</span><span><b>ထုတ်ဝေသည့်နှစ်</b>{book.year}</span></div><div className="detail-summary"><p className="label">{book.externalUrl ? "မူရင်းစာမျက်နှာ" : "အကျဉ်းချုပ်"}</p><p>{book.externalUrl ? "ဤစာအုပ်ကို မူရင်း Wattpad စာမျက်နှာတွင်သာ ဖတ်ရှုပါ။" : book.summary}</p></div>
      {book.externalUrl ? <a className="primary-button wide-button" href={book.externalUrl} target="_blank" rel="noreferrer">Wattpad တွင်ဖတ်မည် <span>↗</span></a> : book.rights === "full" ? <button className="primary-button wide-button" type="button" onClick={onRead}>စာမျက်နှာဖွင့်မည် <span>→</span></button> : <div className="rights-alert"><span>i</span><p><strong>လက်ရှိတွင် အကျဉ်းချုပ်သာ ဖတ်ရှုနိုင်သည်</strong><br />မူပိုင်ခွင့်ခွင့်ပြုချက်ရရှိပြီးနောက် စာအုပ်အပြည့်အစုံကို ထည့်သွင်းပေးမည်။</p></div>}
    </div>
  </div></div>;
}

type ReaderProps = { book: Book; page: number; setPage: (page: number) => void; theme: Theme; setTheme: (theme: Theme) => void; fontScale: number; setFontScale: (scale: number) => void; lineHeight: number; setLineHeight: (height: number) => void; onClose: () => void };

function PdfReader({ book, theme, setTheme, onClose }: { book: Book; theme: Theme; setTheme: (theme: Theme) => void; onClose: () => void }) {
  const shell = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.current?.requestFullscreen?.();
    } catch { setFullscreen(false); }
  }
  async function saveOffline() {
    if (!book.pdfUrl || !("caches" in window)) return;
    setSavingOffline(true);
    try { const response = await fetch(book.pdfUrl, { cache: "no-store" }); if (!response.ok) throw new Error("offline_download_failed"); const cache = await caches.open("thuthayatethar-books-v2"); await cache.put(book.pdfUrl, response.clone()); localStorage.setItem(`thuthayatethar:offline:${book.slug ?? book.id}`, "1"); setOfflineSaved(true); } catch { setOfflineSaved(false); } finally { setSavingOffline(false); }
  }
  useEffect(() => { setOfflineSaved(localStorage.getItem(`thuthayatethar:offline:${book.slug ?? book.id}`) === "1"); }, [book.id, book.slug]);
  const showReaderUI = () => {
    setUiVisible(true);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2400);
  };
  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2400);
    return () => { if (hideTimer.current !== null) window.clearTimeout(hideTimer.current); };
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cache = await caches.open("thuthayatethar-books-v2");
        const cached = await cache.match(book.pdfUrl!);
        const saved = Boolean(cached);
        if (active) setOfflineSaved(saved);
        if (!saved) localStorage.removeItem(`thuthayatethar:offline:${book.slug ?? book.id}`);
      } catch { if (active) setOfflineSaved(false); }
    })();
    return () => { active = false; };
  }, [book.pdfUrl, book.id, book.slug]);
  return <div ref={shell} className={`reader-shell theme-${theme}${uiVisible ? "" : " reader-ui-hidden"}`} onPointerMoveCapture={showReaderUI} onPointerDownCapture={showReaderUI} onContextMenu={(event) => event.preventDefault()}><header className="reader-header"><button type="button" className="reader-back" onClick={onClose}>← <span>စာကြည့်တိုက်သို့ ပြန်မည်</span></button><div className="reader-title"><span>ဖတ်ရှုနေသည်</span><strong>{book.title}</strong></div><div className="reader-header-actions"><div className="reader-theme-buttons" role="group" aria-label="ဖတ်ရှုရန်အရောင်"><button type="button" className={theme === "paper" ? "active paper" : "paper"} onClick={() => setTheme("paper")} aria-label="စာရွက်အရောင်">●</button><button type="button" className={theme === "sepia" ? "active sepia" : "sepia"} onClick={() => setTheme("sepia")} aria-label="Sepia အရောင်">●</button><button type="button" className={theme === "night" ? "active night" : "night"} onClick={() => setTheme("night")} aria-label="ညအရောင်">●</button></div><button type="button" className="reader-offline" onClick={saveOffline} disabled={savingOffline} aria-label="Offline သိမ်းမည်">{savingOffline ? "…" : offlineSaved ? "✓" : "⇩"}<span>{offlineSaved ? "Offline သိမ်းပြီး" : "Offline သိမ်းမည်"}</span></button><button type="button" className="reader-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen ? "အပြည့်မျက်နှာပြင်ပိတ်မည်" : "အပြည့်မျက်နှာပြင်ဖွင့်မည်"}>{fullscreen ? "⤢" : "⛶"}<span>{fullscreen ? "ပိတ်မည်" : "အပြည့်"}</span></button><div className="reader-lock">▣ ဖတ်ရှုရန်သီးသန့်</div></div></header><div className="pdf-reader-workspace"><FlipBook key={book.slug ?? book.id} url={book.pdfUrl ?? ""} title={book.title} progressKey={readingProgressKey(book)} /></div><footer className="reader-nav"><span>လက်နှစ်ချောင်းဖြင့် ချဲ့ကြည့်နိုင်ပါသည်။</span></footer></div>;
}
function Reader(props: ReaderProps) {
  if (props.book.pages.length === 0 && props.book.pdfUrl) return <PdfReader book={props.book} theme={props.theme} setTheme={props.setTheme} onClose={props.onClose} />;
  return <TextReader {...props} />;
}

function TextReader({ book, page, setPage, theme, setTheme, fontScale, setFontScale, lineHeight, setLineHeight, onClose }: ReaderProps) {
  const pageCount = book.pages.length;
  const hideTimer = useRef<number | null>(null);
  const [uiVisible, setUiVisible] = useState(true);
  const showReaderUI = () => {
    setUiVisible(true);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2400);
  };
  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 2400);
    return () => { if (hideTimer.current !== null) window.clearTimeout(hideTimer.current); };
  }, []);
  return <div className={`reader-shell theme-${theme}${uiVisible ? "" : " reader-ui-hidden"}`} onPointerMoveCapture={showReaderUI} onPointerDownCapture={showReaderUI} onContextMenu={(event) => event.preventDefault()}>
    <header className="reader-header"><button type="button" className="reader-back" onClick={onClose}>← <span>စာကြည့်တိုက်သို့ ပြန်မည်</span></button><div className="reader-title"><span>ဖတ်ရှုနေသည်</span><strong>{book.title}</strong></div><div className="reader-lock">▣ ဖတ်ရှုရန်သီးသန့်</div></header>
    <div className="reader-workspace"><aside className="reader-tools"><p className="tools-label">ဖတ်ရှုမှု ပြင်ဆင်ရန်</p><div className="tool-group"><span>စာလုံးအရွယ်</span><div className="tool-buttons"><button type="button" onClick={() => setFontScale(Math.max(.86, fontScale - .08))}>A−</button><b>{Math.round(fontScale * 100)}%</b><button type="button" onClick={() => setFontScale(Math.min(1.2, fontScale + .08))}>A＋</button></div></div><div className="tool-group"><span>စာကြောင်းအကွာ</span><div className="tool-buttons"><button type="button" onClick={() => setLineHeight(Math.max(1.5, lineHeight - .15))}>−</button><b>{lineHeight.toFixed(1)}</b><button type="button" onClick={() => setLineHeight(Math.min(2.2, lineHeight + .15))}>＋</button></div></div><div className="tool-group"><span>နောက်ခံ</span><div className="theme-buttons"><button type="button" aria-label="စာရွက်နောက်ခံ" className={theme === "paper" ? "active" : ""} onClick={() => setTheme("paper")}></button><button type="button" aria-label="အညိုနောက်ခံ" className={theme === "sepia" ? "active sepia" : "sepia"} onClick={() => setTheme("sepia")}></button><button type="button" aria-label="ညနောက်ခံ" className={theme === "night" ? "active night" : "night"} onClick={() => setTheme("night")}></button></div></div><div className="reader-tip"><span>✦</span> ဖတ်နေစဉ် အလင်းရောင်ကို လျှော့ပြီး စိတ်အေးအေးထားပါ။</div></aside>
      <article className="reader-page" style={{ fontSize: `${fontScale}rem`, lineHeight }}><div className="page-topline"><span>{book.category}</span><span>{book.year}</span></div><div className="page-content"><p className="page-kicker">{book.title}</p><h1>{page === 0 ? book.title : `အခန်း ${page + 1}`}</h1><p className="page-author">{book.author}</p><div className="page-rule"></div>{book.pages[page].split("\n").map((line, index) => <p key={`${page}-${index}`}>{line || " "}</p>)}</div><div className="page-footer"><span>သုတရိပ်သာ · {book.id.toString().padStart(2, "0")}</span><b>{String(page + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}</b></div></article>
    </div><footer className="reader-nav"><button type="button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>← အရင်စာမျက်နှာ</button><div className="page-dots">{book.pages.map((_, index) => <button key={index} type="button" className={page === index ? "active" : ""} onClick={() => setPage(index)} aria-label={`စာမျက်နှာ ${index + 1}`}></button>)}</div><button type="button" disabled={page === pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, page + 1))}>နောက်စာမျက်နှာ →</button></footer>
  </div>;
}
