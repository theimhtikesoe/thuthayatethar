import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import PwaRegister from "./PwaRegister";

export const metadata: Metadata = {
  title: "သုတရိပ်သာ — မြန်မာစာအုပ်များအတွက် ဒစ်ဂျစ်တယ်ရိပ်သာ",
  description: "မြန်မာစာအုပ်များကို ရှာဖွေပြီး browser ထဲတွင်သာ ဖတ်ရှုနိုင်သော read-only online library.",
  icons: { icon: "/logo.svg" },
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="my"><body><PwaRegister />{children}</body></html>;
}
