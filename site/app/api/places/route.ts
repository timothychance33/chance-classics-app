import { NextResponse } from "next/server";

const BENTON = { latitude: 32.6946, longitude: -93.7413 };

type PlacePrediction = {
  placeId?: string;
  place?: string;
  text?: { text?: string } | string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  if (query.length < 3) return NextResponse.json({ predictions: [] });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ predictions: [], connected: false });

  const sessionToken = url.searchParams.get("sessionToken")?.trim() || "";
  const body: Record<string, unknown> = {
    input: query.slice(0, 200),
    includedRegionCodes: ["us"],
    locationBias: {
      circle: {
        center: BENTON,
        radius: 50000,
      },
    },
  };
  if (sessionToken) body.sessionToken = sessionToken.slice(0, 36);

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return NextResponse.json({ predictions: [], connected: false });
    const payload = await response.json();
    const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
    const predictions = suggestions
      .slice(0, 5)
      .map((item: { placePrediction?: PlacePrediction }) => {
        const prediction = item?.placePrediction;
        const text = prediction?.text;
        const description = typeof text === "string" ? text : String(text?.text || "");
        const placeId = String(prediction?.placeId || prediction?.place || "").replace(/^places\//, "");
        return { description, placeId };
      })
      .filter((item: { description: string; placeId: string }) => item.description && item.placeId);
    return NextResponse.json({ predictions, connected: true });
  } catch {
    return NextResponse.json({ predictions: [], connected: false });
  }
}
