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
  let body: { intakeId?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const intakeId = typeof body.intakeId === "string" ? body.intakeId : "";
  if (!/^[0-9a-f-]{36}$/i.test(intakeId)) return NextResponse.json({ ok: false, error: "invalid_intake_id" }, { status: 400 });
  try {
    const response = await fetch(`${workerBase()}/admin/retry/${encodeURIComponent(intakeId)}`, { method: "POST", headers: { "x-admin-token": token }, cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ ok: false, error: "admin_unavailable" }, { status: 502 });
  }
}
