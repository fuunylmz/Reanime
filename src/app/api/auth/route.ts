import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    const serverToken = process.env.AUTH_TOKEN;

    if (!serverToken) {
      return NextResponse.json({ success: true, message: "认证未启用。" });
    }

    if (token === serverToken) {
      const response = NextResponse.json({ success: true, message: "认证成功！" });
      response.cookies.set("auth_token", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 天
      });
      return response;
    }

    return NextResponse.json(
      { success: false, error: "令牌无效，请检查后重试。" },
      { status: 401 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
