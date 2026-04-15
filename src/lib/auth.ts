import { NextResponse } from "next/server";

/**
 * 验证请求的认证状态。
 * 当 AUTH_TOKEN 环境变量未设置时，认证默认关闭（适用于纯本地使用场景）。 
 * 设置后，所有敏感 API 需携带 Authorization: Bearer <token> 头或 auth_token cookie。
 */
export function validateAuth(request: Request): NextResponse | null {
  const token = process.env.AUTH_TOKEN;
  if (!token) return null; // 未设置 token = 认证已关闭

  // 检查 Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${token}`) return null;

  // 检查 cookie
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/);
  if (match && match[1] === token) return null;

  return NextResponse.json(
    { success: false, error: "未授权访问。请提供有效的认证令牌。" },
    { status: 401 }
  );
}
