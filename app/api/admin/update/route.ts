import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function workerBase() {
  const configured = process.env.INGESTION_API_URL?.trim() || process.env.CATALOG_API_URL?.trim();
  return (configured || "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, "");
}

export async function PUT(request: Request) {
  const token = cookies().get("admin_session")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { slug?: string; title?: string; author?: string; category?: string; year?: string; summary?: string; coverImage?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.slug || !/^[a-z0-9][a-z0-9-]*$/.test(body.slug)) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  try {
    const response = await fetch(`${workerBase()}/admin/update/${encodeURIComponent(body.slug)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : { ok: response.ok }; } catch { payload = { ok: false, error: "invalid_worker_response" }; }
    return NextResponse.json(payload, { status: response.status });
  } catch { return NextResponse.json({ ok: false, error: "admin_unavailable" }, { status: 502 }); }
}
