import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function workerBase() { const configured = process.env.INGESTION_API_URL?.trim() || process.env.CATALOG_API_URL?.trim(); return (configured || "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, ""); }

export async function POST(request: Request) {
  const token = cookies().get("admin_session")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { slug?: string; rightsHolder?: string; evidenceNote?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.slug || !/^[a-z0-9][a-z0-9-]*$/.test(body.slug)) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  try {
    const response = await fetch(`${workerBase()}/admin/approve/${encodeURIComponent(body.slug)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ rightsHolder: body.rightsHolder, evidenceNote: body.evidenceNote }),
      cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ ok: false, error: "admin_unavailable" }, { status: 502 }); }
}
