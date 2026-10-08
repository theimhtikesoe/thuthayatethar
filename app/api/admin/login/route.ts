import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function workerBase() { const configured = process.env.INGESTION_API_URL?.trim() || process.env.CATALOG_API_URL?.trim(); return (configured || "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, ""); }

export async function POST(request: Request) {
  let body: { token?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "token_required" }, { status: 400 });
  try {
    const response = await fetch(`${workerBase()}/admin/drafts`, { headers: { "x-admin-token": token }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const result = NextResponse.json({ ok: true });
    result.cookies.set("admin_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 });
    return result;
  } catch { return NextResponse.json({ ok: false, error: "admin_unavailable" }, { status: 502 }); }
}

export async function DELETE() {
  const result = NextResponse.json({ ok: true });
  result.cookies.delete("admin_session");
  return result;
}
