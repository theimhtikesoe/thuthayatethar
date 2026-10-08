import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function workerBase() { return (process.env.INGESTION_API_URL ?? process.env.CATALOG_API_URL ?? "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, ""); }

export async function DELETE(request: Request) {
  const token = cookies().get("admin_session")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: { slug?: string } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.slug || !/^[a-z0-9][a-z0-9-]*$/.test(body.slug)) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  const response = await fetch(`${workerBase()}/admin/delete/${encodeURIComponent(body.slug)}`, { method: "DELETE", headers: { "x-admin-token": token }, cache: "no-store" });
  return NextResponse.json(await response.json(), { status: response.status });
}
