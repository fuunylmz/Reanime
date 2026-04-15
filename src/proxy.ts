import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy (原 middleware) - 全局认证守卫
 * 当 AUTH_TOKEN 环境变量已设置时，保护所有页面和 API 路由。
 * 未认证用户访问页面时重定向至 /login，访问 API 时返回 401。
 */
export function proxy(request: NextRequest) {
  const token = process.env.AUTH_TOKEN;
  if (!token) return NextResponse.next(); // 认证未启用

  // 检查 cookie 或 Authorization header
  const cookieToken = request.cookies.get('auth_token')?.value;
  const headerToken = request.headers.get('authorization')?.replace('Bearer ', '');

  if (cookieToken === token || headerToken === token) {
    return NextResponse.next();
  }

  // API 路由返回 401
  if (request.nextUrl.pathname.startsWith('/api')) {
    // 放行 /api/auth（登录接口本身不能被拦截）
    if (request.nextUrl.pathname === '/api/auth') {
      return NextResponse.next();
    }
    return NextResponse.json(
      { success: false, error: "未授权访问，请先登录。" },
      { status: 401 }
    );
  }

  // 页面路由重定向到登录页
  if (request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/',
    '/tasks',
    '/settings',
    '/logs',
  ],
};
