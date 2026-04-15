import { NextResponse } from "next/server";
import { getAllSettings } from "@/lib/settings";
import { getTMDBDetails } from "@/lib/tmdb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idStr = searchParams.get("id");
  if (!idStr) return NextResponse.json({ success: false, error: "Missing ID" }, { status: 400 });

  const id = parseInt(idStr, 10);
  const config = await getAllSettings();
  if (!config.tmdbKey) {
    return NextResponse.json({ success: false, error: "Missing TMDB Key" }, { status: 400 });
  }

  // 先尝试 TV
  let result = await getTMDBDetails(id, config.tmdbKey, "tv");
  if (!result) {
    // 找不到再尝试 Movie
    result = await getTMDBDetails(id, config.tmdbKey, "movie");
  }

  if (result) {
    return NextResponse.json({ success: true, data: result });
  } else {
    return NextResponse.json({ success: false, error: "Detailed info not found" }, { status: 404 });
  }
}
