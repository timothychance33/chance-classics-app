import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 3) return NextResponse.json({ predictions: [] });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ predictions: [], connected: false });

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query.slice(0, 200));
  url.searchParams.set("components", "country:us");
  url.searchParams.set("types", "address");
  url.searchParams.set("key", key);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    const predictions = Array.isArray(body?.predictions)
      ? body.predictions.slice(0, 5).map((item: { description?: string; place_id?: string }) => ({
          description: String(item.description || ""),
          placeId: String(item.place_id || ""),
        })).filter((item: { description: string; placeId: string }) => item.description && item.placeId)
      : [];
    return NextResponse.json({ predictions, connected: true });
  } catch {
    return NextResponse.json({ predictions: [], connected: false });
  }
}
