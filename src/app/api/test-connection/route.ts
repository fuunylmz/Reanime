import { NextResponse } from "next/server";
import { OpenAI } from "openai";

export async function POST(request: Request) {
  try {
    const { apiKey, baseURL, model } = await request.json();
    if (!apiKey) return NextResponse.json({ success: false, error: "缺少 API Key" }, { status: 400 });

    const testModel = model || "gpt-4o-mini";

    const openai = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });

    const response = await openai.chat.completions.create({
      model: testModel,
      messages: [{ role: "user", content: "Hi, please reply with exactly the word: 'pong'. Do not include quotes or punctuation." }],
      max_tokens: 5,
    });

    const reply = response.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ success: true, message: `模型(${testModel}) 成功返回了消息: ${reply}` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
