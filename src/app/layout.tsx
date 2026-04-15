import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Link from "next/link";
import { Home, Settings, History, Activity, Library } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reanime",
  description: "自动化的影视资源整理与刮削工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-slate-50 flex antialiased`}>
        {/* Sidebar */}
        <aside className="w-64 border-r border-zinc-800/60 bg-zinc-900/40 p-6 flex flex-col gap-6 backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4 select-none">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 flex items-center justify-center font-black text-xl text-white">
              R
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-300">
              Reanime
            </h1>
          </div>
          <nav className="flex flex-col gap-1.5">
            <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/80 transition-all text-zinc-400 hover:text-white font-medium text-sm">
              <Home size={18} /> 控制面板
            </Link>
            <Link href="/tasks" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/80 transition-all text-zinc-400 hover:text-white font-medium text-sm">
              <Activity size={18} /> 处理队列
            </Link>
            <Link href="/library" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/80 transition-all text-zinc-400 hover:text-white font-medium text-sm">
              <Library size={18} /> 媒体档案
            </Link>
            <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/80 transition-all text-zinc-400 hover:text-white font-medium text-sm">
              <Settings size={18} /> 系统设置
            </Link>
            <Link href="/logs" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/80 transition-all text-zinc-400 hover:text-white font-medium text-sm">
              <History size={18} /> 处理日志
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto relative h-screen">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>

        <Toaster theme="dark" />
      </body>
    </html>
  );
}
