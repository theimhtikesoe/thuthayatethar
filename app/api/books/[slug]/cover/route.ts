import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function workerBase() {
  const configured = process.env.INGESTION_API_URL?.trim() || process.env.CATALOG_API_URL?.trim();
  return (configured || "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, "");
}

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const response = await fetch(`${workerBase()}/book/${encodeURIComponent(params.slug)}/cover`, { cache: "no-store" });
    const headers = new Headers();
    for (const name of ["content-type", "content-length", "cache-control", "etag"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return NextResponse.json({ ok: false, error: "cover_unavailable" }, { status: 502 });
  }
}
