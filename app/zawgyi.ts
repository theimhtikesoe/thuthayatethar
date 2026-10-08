"use client";

type MyanmarTools = { ZawgyiConverter: new () => { zawgyiToUnicode: (value: string) => string }; ZawgyiDetector: new () => { getZawgyiProbability: (value: string) => number } };
let converter: { zawgyiToUnicode: (value: string) => string } | null = null;
let detector: { getZawgyiProbability: (value: string) => number } | null = null;
let toolsPromise: Promise<MyanmarTools> | null = null;
const STRONG_ZAWGYI_THRESHOLD = 0.9;
const MYANMAR_CHARACTERS = /[\u1000-\u109f\uaa60-\uaa7f]/;

function loadMyanmarTools() {
  if (typeof window === "undefined") return Promise.reject(new Error("browser_only"));
  if (toolsPromise) return toolsPromise;
  toolsPromise = new Promise((resolve, reject) => {
    const existing = (window as Window & { google_myanmar_tools?: MyanmarTools }).google_myanmar_tools;
    if (existing?.ZawgyiConverter && existing.ZawgyiDetector) return resolve(existing);
    const scripts = ["/zawgyi-detector.min.js", "/zawgyi-converter.min.js"];
    let loaded = 0;
    for (const src of scripts) {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => { loaded += 1; if (loaded === scripts.length) { const tools = (window as Window & { google_myanmar_tools?: MyanmarTools }).google_myanmar_tools; tools ? resolve(tools) : reject(new Error("converter_unavailable")); } };
      script.onerror = () => reject(new Error("converter_asset_unavailable"));
      document.head.appendChild(script);
    }
  });
  return toolsPromise;
}

export async function normalizeMyanmarText(value: string) {
  if (!value.trim() || !MYANMAR_CHARACTERS.test(value)) return { text: value, isZawgyi: false, probability: 0 };
  try {
    if (!converter || !detector) {
      const tools = await loadMyanmarTools();
      converter = new tools.ZawgyiConverter();
      detector = new tools.ZawgyiDetector();
    }
    const probability = detector.getZawgyiProbability(value);
    const isZawgyi = probability >= STRONG_ZAWGYI_THRESHOLD;
    return {
      text: isZawgyi ? converter.zawgyiToUnicode(value) : value,
      isZawgyi,
      probability,
    };
  } catch {
    return { text: value, isZawgyi: false, probability: 0 };
  }
}
