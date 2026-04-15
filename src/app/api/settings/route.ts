import { NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@/lib/settings";

export async function GET() {
  const config = await getAllSettings();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        await setSetting(key, value);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
