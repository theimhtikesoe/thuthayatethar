import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function workerBase() {
  const configured = process.env.INGESTION_API_URL?.trim() || process.env.CATALOG_API_URL?.trim();
  return (configured || "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev/catalog").replace(/\/catalog\/?$/, "");
}

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  // A top-level browser visit should open the app's book-flip reader instead
  // of Safari's standalone PDF viewer. PDF.js/offline fetches use */* and keep
  // receiving the PDF bytes from this same URL.
  if (request.headers.get("accept")?.toLowerCase().includes("text/html")) {
    const redirect = NextResponse.redirect(new URL("/", request.url), 302);
    redirect.headers.set("Location", `/#read=${encodeURIComponent(params.slug)}`);
    redirect.headers.set("Cache-Control", "no-store");
    redirect.headers.set("Vary", "Accept");
    return redirect;
  }
  try {
    const headers = new Headers();
    const range = request.headers.get("range");
    if (range) headers.set("range", range);
    const response = await fetch(`${workerBase()}/book/${encodeURIComponent(params.slug)}/pdf`, { headers, cache: "no-store" });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition", "cache-control"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!responseHeaders.has("cache-control")) responseHeaders.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
    responseHeaders.set("Vary", "Accept");
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch { return NextResponse.json({ ok: false, error: "pdf_unavailable" }, { status: 502 }); }
}
