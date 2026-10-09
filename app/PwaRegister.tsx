"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "./offline-storage";

export default function PwaRegister() {
  useEffect(() => {
    if ("storage" in navigator) void requestPersistentStorage(navigator.storage);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
