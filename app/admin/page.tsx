"use client";

import { FormEvent, useEffect, useState } from "react";
import { correctedCatalogTitle } from "../burmese-text";

type Draft = {
  id: string;
  intake_id: string;
  title: string;
  slug: string | null;
  author: string | null;
  category: string | null;
  year: string | null;
  summary: string | null;
  soundcloud_url: string | null;
  original_filename: string | null;
  storage_key: string | null;
  source_type: string | null;
  source_url: string | null;
  publication_status: string;
  intake_status: string;
  failure_code: string | null;
  failure_message: string | null;
  rights_status: string;
  rights_holder: string | null;
  evidence_note: string | null;
  updated_at: string;
};

type EditState = { title: string; author: string; category: string; year: string; summary: string; coverImage: string; soundcloud_url: string };
const blankEdit: EditState = { title: "", author: "", category: "", year: "", summary: "", coverImage: "", soundcloud_url: "" };

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>(blankEdit);

  async function loadDrafts(): Promise<Draft[]> {
    const response = await fetch("/api/admin/drafts", { cache: "no-store" });
    if (response.status === 401) {
      setLoggedIn(false);
      return [];
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "admin_unavailable");
    const rows: Draft[] = payload.drafts ?? [];
    setDrafts(rows);
    setLoggedIn(true);
    return rows;
  }

  useEffect(() => { loadDrafts().catch(() => setLoggedIn(false)); }, []);

  useEffect(() => {
    if (!loggedIn || !drafts.some((draft) => !draft.slug && draft.intake_status !== "failed")) return;
    const timer = window.setInterval(() => { void loadDrafts().catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, [loggedIn, drafts]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error("Token မမှန်ပါ သို့မဟုတ် Worker မရနိုင်ပါ");
      setToken("");
      await loadDrafts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login မအောင်မြင်ပါ");
    } finally {
      setLoading(false);
    }
  }

  async function retryPdf(intakeId: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intakeId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "PDF ပြန်သိမ်းခြင်း မအောင်မြင်ပါ");
      setMessage("PDF ကို private storage ထဲ ပြန်သိမ်းနေသည်။ ဖိုင်ကြီးဖြစ်ပါက အချိန်ယူနိုင်ပါသည်။");
      await loadDrafts();
      void (async () => {
        for (let attempt = 0; attempt < 36; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 5000));
          try {
            const rows = await loadDrafts();
            const row = rows.find((item) => item.intake_id === intakeId);
            if (!row) {
              setMessage("PDF ကို admin စာရင်းထဲ မတွေ့ပါ။ စာမျက်နှာကို ပြန်ဖွင့်ပြီး စစ်ဆေးပါ။");
              return;
            }
            if (row.intake_status === "failed") {
              setMessage(`PDF ပြန်သိမ်းမအောင်မြင်ပါ: ${row.failure_message ?? row.failure_code ?? "unknown_error"}`);
              return;
            }
            if (row.intake_status === "published") {
              setMessage("PDF ကို သိမ်းပြီး Website ပေါ်သို့ အလိုအလျောက် တင်ပြီးပါပြီ။ မူပိုင်ခွင့်ကို မစစ်ဆေးရသေးပါ — စစ်ပြီးလျှင် “Rights အတည်ပြုမည်” ကို နှိပ်ပါ။");
              return;
            }
            if (row.intake_status === "draft") {
              setMessage("PDF ကို private admin မူကြမ်းအဖြစ် သိမ်းပြီးပါပြီ (auto-publish မစတင်မီ ရောက်ခဲ့သော ဖိုင်ဖြစ်သည်)။ Website ပေါ်တင်လိုလျှင် “အတည်ပြုမည်” နှင့် “Website ပေါ်တင်မည်” ကို သုံးပါ။");
              return;
            }
          } catch {
            return;
          }
        }
        setMessage("ဖိုင်ကို ဆက်လက်သိမ်းဆည်းနေဆဲပါ။ ခဏနေရင် စာမျက်နှာကို ပြန်ဖွင့်ပါ။");
      })();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF ပြန်သိမ်းခြင်း မအောင်မြင်ပါ");
    } finally {
      setLoading(false);
    }
  }

  async function approve(slug: string, alreadyPublished = false) {
    if (!window.confirm(alreadyPublished ? "ဒီစာအုပ်သည် Website ပေါ်တွင် ပေါ်နေပြီးဖြစ်သည်။ မူပိုင်ခွင့်ကို စစ်ဆေးပြီးကြောင်း မှတ်တမ်းတင်မလား?" : "ဒီ Telegram PDF ကို private မူကြမ်းအဖြစ် အတည်ပြုမလား? Website ပေါ် မတင်သေးပါ။")) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, evidenceNote: "Admin dashboard confirmation" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Telegram PDF အတည်ပြုခြင်း မအောင်မြင်ပါ");
      setMessage(alreadyPublished ? `“${slug}” ၏ rights ကို အတည်ပြုပြီးပါပြီ။ Website ပေါ်တွင် ပေါ်နေပြီးဖြစ်သည်။` : `“${slug}” ကို private မူကြမ်းအဖြစ် အတည်ပြုပြီးပါပြီ။ Website ပေါ်တင်ရန် နောက်တစ်ဆင့်ကို သုံးပါ။`);
      await loadDrafts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Telegram PDF အတည်ပြုခြင်း မအောင်မြင်ပါ");
    } finally {
      setLoading(false);
    }
  }

  async function publish(slug: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Publish မအောင်မြင်ပါ");
      setMessage(`“${slug}” ကို publish လုပ်ပြီးပါပြီ။`);
      await loadDrafts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish မအောင်မြင်ပါ");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(draft: Draft) {
    if (!draft.slug) return;
    setEditing(draft.slug);
    setEdit({ title: correctedCatalogTitle(draft.title), author: draft.author ?? "", category: draft.category ?? "", year: draft.year ?? "", summary: draft.summary ?? "", coverImage: "", soundcloud_url: draft.soundcloud_url ?? "" });
  }

  async function saveEdit(slug: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/update", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, ...edit }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Update မအောင်မြင်ပါ");
      setEditing(null);
      setMessage(`“${slug}” metadata ကို update လုပ်ပြီးပါပြီ။`);
      await loadDrafts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update မအောင်မြင်ပါ");
    } finally {
      setLoading(false);
    }
  }

  async function deleteBook(slug: string, title: string, isAudiobook = false) {
    const confirmation = isAudiobook
      ? `“${title}” အသံစာအုပ်ကို Website စာရင်းမှ အပြီးဖယ်ရှားမလား? SoundCloud ပေါ်ရှိ မူရင်းအသံဖိုင်ကို မဖျက်ပါ။ ပြန်ယူမရပါ။`
      : `“${title}” နှင့် ၎င်း၏ R2 PDF ကို အပြီးဖျက်မလား? ပြန်ယူမရပါ။`;
    if (!window.confirm(confirmation)) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/delete", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Delete မအောင်မြင်ပါ");
      setMessage(isAudiobook ? `“${title}” ကို Website စာရင်းမှ ဖယ်ရှားပြီးပါပြီ။ မူရင်း SoundCloud အသံဖိုင်ကို မဖျက်ပါ။` : `“${title}” ကို ဖျက်ပြီးပါပြီ။`);
      await loadDrafts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete မအောင်မြင်ပါ");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setLoggedIn(false);
    setDrafts([]);
  }

  if (!loggedIn) return <main className="admin-shell"><div className="admin-card admin-login"><p className="eyebrow"><span className="eyebrow-dot" /> ADMIN REVIEW</p><h1>စာအုပ်နှင့် အသံစာအုပ်များကို စီမံရန်</h1><p>Telegram မှ ရောက်လာသော စာအုပ်နှင့် အသံစာအုပ်များကို စစ်ဆေး၊ ပြင်ဆင်၊ Website ပေါ်တင် သို့မဟုတ် စာရင်းမှ ဖယ်ရှားနိုင်ပါသည်။</p><form onSubmit={login}><label>Admin token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="current-password" placeholder="Token ကို ဒီမှာထည့်ပါ" /></label><button className="primary-button" disabled={loading}>{loading ? "စစ်ဆေးနေသည်…" : "ဝင်ရောက်မည်"}</button></form>{message && <p className="admin-message error">{message}</p>}</div></main>;

  return <main className="admin-shell"><header className="admin-header"><div><p className="eyebrow"><span className="eyebrow-dot" /> ADMIN REVIEW</p><h1>တင်သွင်းလာသော စာအုပ်နှင့် အသံစာအုပ်များ</h1><p>Rights အတည်ပြုခြင်း၊ metadata ပြင်ခြင်း၊ Website publish နှင့် ဖျက်ခြင်းကို ဒီနေရာမှာ လုပ်နိုင်ပါသည်။ Telegram မှ မအောင်မြင်ခဲ့သော PDF များကိုလည်း ဒီနေရာမှ ပြန်သိမ်းနိုင်ပါသည်။ Telegram PDF အသစ်များကို မူပိုင်ခွင့် မစစ်ဆေးရသေးဘဲ Website ပေါ်သို့ အလိုအလျောက် တင်ပါသည် — “auto_publish_unreviewed” ဟု မှတ်ထားသည်များကို စစ်ပြီး Rights အတည်ပြုနိုင်ပါသည်။</p></div><button className="quiet-button" onClick={logout}>ထွက်မည်</button></header>{message && <p className="admin-message">{message}</p>}<section className="admin-list">{drafts.length === 0 ? <div className="admin-empty">စာအုပ်တင်သွင်းမှု မရှိသေးပါ။</div> : drafts.map((draft) => { const needsSync = Boolean(draft.slug) && draft.publication_status === "published" && draft.intake_status !== "published"; const canApprove = Boolean(draft.slug) && (Boolean(draft.storage_key) || (draft.source_type === "soundcloud_link" && Boolean(draft.soundcloud_url))) && draft.intake_status === "draft" && draft.rights_status !== "approved" && draft.publication_status !== "published"; const canApproveRights = Boolean(draft.slug) && Boolean(draft.storage_key) && draft.intake_status === "published" && draft.publication_status === "published" && draft.rights_status !== "approved"; const isProcessing = !draft.slug && draft.intake_status !== "failed"; return <article className="admin-item" key={draft.id}><div className="admin-item-main"><span className={`admin-status ${draft.publication_status}`}>{draft.publication_status}</span><h2>{correctedCatalogTitle(draft.title)}</h2><p className="admin-muted">{draft.source_type === "wattpad_link" ? "Wattpad external link" : draft.source_type === "soundcloud_link" || draft.soundcloud_url ? "အသံစာအုပ် · SoundCloud" : draft.original_filename ?? "ဖိုင်အမည်မရှိ"} · {draft.slug ?? draft.id}</p>{draft.source_url && <p className="admin-note"><a href={draft.source_url} target="_blank" rel="noreferrer">{draft.source_type === "soundcloud_link" || draft.soundcloud_url ? "SoundCloud မူရင်းအသံစာမျက်နှာကို ဖွင့်မည် ↗" : "မူရင်း link ကို ဖွင့်မည် ↗"}</a></p>}<dl><div><dt>Rights</dt><dd>{draft.rights_status}</dd></div><div><dt>Intake</dt><dd>{draft.intake_status === "downloading" ? "ဖိုင်သိမ်းဆည်းနေသည်…" : draft.intake_status}</dd></div><div><dt>R2</dt><dd>{draft.storage_key ? "သိမ်းပြီး" : draft.source_type === "wattpad_link" || draft.source_type === "soundcloud_link" ? "မလိုအပ်" : "မရှိသေး"}</dd></div></dl>{draft.failure_message && <p className="admin-note error">{draft.failure_message}</p>}{draft.evidence_note && <p className="admin-note">Evidence: {draft.evidence_note}</p>}{isProcessing && <p className="admin-note">Telegram PDF ကို private storage ထဲ သိမ်းနေသည်။ ပြီးသွားလျှင် Telegram PDF အသစ်များကို Website ပေါ်သို့ အလိုအလျောက် တင်ပါမည် (auto-publish မစတင်မီ ရောက်ခဲ့သော ဖိုင်များ မူကြမ်းအဖြစ်သာ ကျန်ပါမည်)။</p>}{editing === draft.slug && draft.slug && <div className="admin-edit-form"><label>Title<input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label><label>Author<input value={edit.author} onChange={(e) => setEdit({ ...edit, author: e.target.value })} /></label><label>Category<input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></label><label>Year<input value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value })} /></label><label>Cover image URL<input value={edit.coverImage} onChange={(e) => setEdit({ ...edit, coverImage: e.target.value })} placeholder="https://.../cover.jpg" /></label><label>SoundCloud track URL<input type="url" value={edit.soundcloud_url} onChange={(e) => setEdit({ ...edit, soundcloud_url: e.target.value })} placeholder="https://soundcloud.com/artist/track" /></label><label>Summary<textarea value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></label><div className="admin-edit-actions"><button className="primary-button" disabled={loading} onClick={() => saveEdit(draft.slug!)}>သိမ်းမည်</button><button className="quiet-button" onClick={() => setEditing(null)}>မလုပ်တော့</button></div></div>}</div><div className="admin-actions">{draft.slug ? <><button className="quiet-button" disabled={loading} onClick={() => startEdit(draft)}>ပြင်မည်</button><button className="danger-button" disabled={loading} onClick={() => deleteBook(draft.slug!, draft.title, draft.source_type === "soundcloud_link" || Boolean(draft.soundcloud_url))}>{draft.source_type === "soundcloud_link" || draft.soundcloud_url ? "အသံစာအုပ် ဖယ်ရှားမည်" : "ဖျက်မည်"}</button><button className="primary-button" disabled={loading || (draft.publication_status === "published" && !needsSync && !canApproveRights) || (!canApprove && draft.publication_status !== "published" && draft.intake_status !== "draft")} onClick={() => canApprove ? approve(draft.slug!) : canApproveRights ? approve(draft.slug!, true) : publish(draft.slug!)}>{canApprove ? "အတည်ပြုမည်" : canApproveRights ? "Rights အတည်ပြုမည်" : needsSync ? "Status sync လုပ်မည်" : draft.publication_status === "published" ? "Published" : draft.intake_status === "draft" ? "Website ပေါ်တင်မည်" : "ဖိုင်စီမံနေသည်…"}</button></> : draft.intake_status === "failed" && draft.original_filename?.toLowerCase().endsWith(".pdf") ? <button className="primary-button" disabled={loading} onClick={() => retryPdf(draft.intake_id)}>PDF ကို ပြန်သိမ်းစမ်းမည်</button> : <span className="admin-note">ဖိုင်ကို စီမံနေသည်…</span>}</div></article>; })}</section></main>;
}
