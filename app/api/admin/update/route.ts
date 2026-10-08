import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function workerBase() { return (process.env.INGESTION_API_URL ?? process.env.CATALOG_API_URL ?? "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, ""); }

export async function PUT(request: Request) {
  const token = cookies().get("admin_session")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  const response = await fetch(`${workerBase()}/admin/update/${encodeURIComponent(slug)}`, { method: "PUT", headers: { "content-type": "application/json", "x-admin-token": token }, body: JSON.stringify(body), cache: "no-store" });
  return NextResponse.json(await response.json(), { status: response.status });
}
