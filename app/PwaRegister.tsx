"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "./offline-storage";

export default function PwaRegister() {
  useEffect(() => {
    if ("storage" in navigator) void requestPersistentStorage(navigator.storage);
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent("catalog-refresh-20261010")}`, { scope: "/" })
      .then((registration) => {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        void registration.update();
      })
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}
