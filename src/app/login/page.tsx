"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "认证失败");
      }
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8 select-none">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 flex items-center justify-center font-black text-2xl text-white">
            R
          </div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-300">
            Reanime
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5 shadow-2xl">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-zinc-200">访问认证</h2>
            <p className="text-sm text-zinc-500 mt-1">请输入系统访问令牌以继续</p>
          </div>
          
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="AUTH_TOKEN"
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
            autoFocus
          />

          {error && (
            <p className="text-sm text-rose-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20"
          >
            {loading ? "验证中..." : "进入系统"}
          </button>
        </form>

        <p className="text-xs text-zinc-700 text-center mt-4">
          令牌由 .env 文件中的 AUTH_TOKEN 环境变量控制
        </p>
      </div>
    </div>
  );
}
