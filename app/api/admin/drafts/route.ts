import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function workerBase() {
  return (process.env.INGESTION_API_URL ?? process.env.CATALOG_API_URL ?? "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, "");
}

export async function GET() {
  const token = cookies().get("admin_session")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const response = await fetch(`${workerBase()}/admin/drafts`, { headers: { "x-admin-token": token }, cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ ok: false, error: "admin_unavailable" }, { status: 502 }); }
}
