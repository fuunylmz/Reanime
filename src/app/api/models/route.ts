import { NextResponse } from "next/server";
import { OpenAI } from "openai";

export async function POST(request: Request) {
  try {
    const { apiKey, baseURL } = await request.json();
    if (!apiKey) return NextResponse.json({ success: false, error: "缺少 API Key" }, { status: 400 });

    const openai = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });

    const models = await openai.models.list();
    const modelIds = models.data.map(m => m.id);

    return NextResponse.json({ success: true, models: modelIds });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
