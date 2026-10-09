import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function normalizeSoundCloudUrl(value: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || !["soundcloud.com", "on.soundcloud.com"].includes(host)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const soundcloudUrl = normalizeSoundCloudUrl(new URL(request.url).searchParams.get("url"));
  if (!soundcloudUrl) return NextResponse.json({ error: "invalid_soundcloud_url" }, { status: 400 });

  try {
    const oembed = await fetch(`https://soundcloud.com/oembed?url=${encodeURIComponent(soundcloudUrl)}&format=json`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!oembed.ok) return NextResponse.json({ error: "cover_not_found" }, { status: 404 });
    const payload = await oembed.json() as { thumbnail_url?: string };
    const thumbnailUrl = payload.thumbnail_url;
    if (!thumbnailUrl || !thumbnailUrl.startsWith("https://i1.sndcdn.com/")) {
      return NextResponse.json({ error: "cover_not_found" }, { status: 404 });
    }

    const image = await fetch(thumbnailUrl, { cache: "no-store" });
    if (!image.ok || !image.body) return NextResponse.json({ error: "cover_not_found" }, { status: 404 });
    const headers = new Headers({
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    });
    const contentType = image.headers.get("content-type");
    if (contentType?.startsWith("image/")) headers.set("Content-Type", contentType);
    return new Response(image.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "cover_unavailable" }, { status: 502 });
  }
}
