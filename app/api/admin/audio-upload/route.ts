import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function workerBase() {
  const configured = process.env.INGESTION_API_URL?.trim() || process.env.CATALOG_API_URL?.trim();
  return (configured || "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, "");
}

export async function POST(request: Request) {
  const token = cookies().get("admin_session")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let incoming: FormData;
  try { incoming = await request.formData(); } catch { return NextResponse.json({ ok: false, error: "invalid_multipart" }, { status: 400 }); }
  const outgoing = new FormData();
  incoming.forEach((value, key) => outgoing.append(key, value));
  try {
    const response = await fetch(`${workerBase()}/admin/audio-upload`, { method: "POST", headers: { "x-admin-token": token }, body: outgoing, cache: "no-store" });
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : { ok: response.ok }; } catch { payload = { ok: false, error: "invalid_worker_response" }; }
    return NextResponse.json(payload, { status: response.status });
  } catch { return NextResponse.json({ ok: false, error: "admin_unavailable" }, { status: 502 }); }
}
