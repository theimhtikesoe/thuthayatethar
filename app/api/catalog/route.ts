import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const endpoint = process.env.CATALOG_API_URL?.trim() || "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog";
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ ok: false, books: [], error: "catalog_unavailable" }, { status: 502 });
  }
}
