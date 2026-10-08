"use client";

type MyanmarTools = {
  ZawgyiConverter: new () => { zawgyiToUnicode: (value: string) => string };
  ZawgyiDetector: new () => { getZawgyiProbability: (value: string) => number };
};
type Converter = { zawgyiToUnicode: (value: string) => string };
type Detector = { getZawgyiProbability: (value: string) => number };

let converter: Converter | null = null;
let detector: Detector | null = null;
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
      script.onload = () => {
        loaded += 1;
        if (loaded === scripts.length) {
          const tools = (window as Window & { google_myanmar_tools?: MyanmarTools }).google_myanmar_tools;
          tools ? resolve(tools) : reject(new Error("converter_unavailable"));
        }
      };
      script.onerror = () => reject(new Error("converter_asset_unavailable"));
      document.head.appendChild(script);
    }
  });
  return toolsPromise;
}

async function getMyanmarTools() {
  if (!converter || !detector) {
    const tools = await loadMyanmarTools();
    converter = new tools.ZawgyiConverter();
    detector = new tools.ZawgyiDetector();
  }
  return { converter, detector };
}

export async function detectMyanmarText(value: string) {
  if (!value.trim() || !MYANMAR_CHARACTERS.test(value)) return { isZawgyi: false, probability: 0 };
  try {
    const tools = await getMyanmarTools();
    const probability = tools.detector.getZawgyiProbability(value);
    return { isZawgyi: probability >= STRONG_ZAWGYI_THRESHOLD, probability };
  } catch {
    return { isZawgyi: false, probability: 0 };
  }
}

export async function convertZawgyiText(value: string) {
  if (!value || !MYANMAR_CHARACTERS.test(value)) return value;
  try {
    const tools = await getMyanmarTools();
    return tools.converter.zawgyiToUnicode(value);
  } catch {
    return value;
  }
}

export async function normalizeMyanmarText(value: string) {
  const detected = await detectMyanmarText(value);
  return {
    text: detected.isZawgyi ? await convertZawgyiText(value) : value,
    ...detected,
  };
}
