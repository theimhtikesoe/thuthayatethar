import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import PwaRegister from "./PwaRegister";

export const metadata: Metadata = {
  title: "သုတရိပ်သာ",
  applicationName: "သုတရိပ်သာ",
  description: "မြန်မာစာအုပ်များကို ရှာဖွေပြီး browser ထဲတွင်သာ ဖတ်ရှုနိုင်သော read-only online library.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "သုတရိပ်သာ", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="my"><body><PwaRegister />{children}</body></html>;
}
