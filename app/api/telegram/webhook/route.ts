import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const target = process.env.TELEGRAM_INGESTION_URL;
  if (!target) return Response.json({ ok: false, error: "ingestion_receiver_not_configured" }, { status: 503 });

  const body = await request.arrayBuffer();
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        "x-telegram-bot-api-secret-token": request.headers.get("x-telegram-bot-api-secret-token") ?? "",
      },
      body,
      cache: "no-store",
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, error: "ingestion_receiver_unavailable" }, { status: 502 });
  }
}
