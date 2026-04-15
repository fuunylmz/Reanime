"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = () => {
    fetch("/api/logs").then(res => res.json()).then(data => {
      if (data.success) {
        setLogs(data.logs);
      }
    });
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClear = async () => {
    if (!confirm("🚨 确定要一键清空所有的历史扫描日志和状态吗？\n\n注意：这不仅将擦除历史面板的显示记录，而且会导致防重复系统“遗忘”之前扫描过的文件（重新扫描源目录时它们会被当做新文件再次处理）！\n\n如果您是为了修复错误或者重新对同一批漏网文件进行扫描与覆盖，此操作正是绝佳选择。")) return;
    
    setClearing(true);
    try {
        const res = await fetch("/api/logs", { method: "DELETE" });
        if (res.ok) {
            toast.success("历史底层日志库已彻底清空重置，系统已重新处于未污染的崭新验证状态！");
            setLogs([]);
        } else {
             toast.error("清空失败，本地 SQLite 返回异常，请检查权限。");
        }
    } catch {
         toast.error("网络通信错误致使删除终端指令发送失败");
    } finally {
        setClearing(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">处理日志库</h2>
          <p className="text-zinc-400 mt-1">查看最近处理与搜刮的媒体文件历史详情与操作归档。</p>
        </div>
        <Button variant="destructive" onClick={handleClear} disabled={clearing} className="shadow-lg shadow-red-900/20 font-medium tracking-wide">
           <Trash2 className="mr-2" size={16} /> {clearing ? "正在抹除全库数据..." : "一键清空历史日志与系统记忆"}
        </Button>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>近期记录 (仅渲染排名前100条)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500 py-10 text-center flex flex-col items-center gap-2">
                <Trash2 className="text-zinc-800" size={32} />
                当前没有留存任何历史处理记录，或数据库已被彻底重置清理殆尽。
              </p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200 truncate" title={log.originalName}>
                      {log.originalName}
                    </p>
                    {log.targetPath && (
                      <p className="text-xs text-zinc-500 mt-1 font-mono break-all line-clamp-2">
                        ↳ {log.targetPath}
                      </p>
                    )}
                    {log.errorMessage && (
                      <p className="text-xs text-rose-400 mt-1">错误详情拦截: {log.errorMessage}</p>
                    )}
                    <p className="text-xs text-zinc-600 mt-3 font-mono">
                      记账时间: {new Date(log.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 pl-8 md:pl-0 mt-2 md:mt-0">
                    {log.tmdbName && (
                      <Badge variant="outline" className="text-blue-400 border-blue-400/30 shadow-sm whitespace-nowrap">
                        {log.tmdbName}
                      </Badge>
                    )}
                    <Badge variant={log.status === "SUCCESS" ? "default" : "destructive"} className={log.status === "SUCCESS" ? "bg-emerald-600 hover:bg-emerald-500 whitespace-nowrap" : "whitespace-nowrap"}>
                      {log.status === "SUCCESS" ? "迁移处理成功" : "匹配发生阻断异常"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
