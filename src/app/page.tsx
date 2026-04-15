"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PlayCircle, ShieldCheck, AlertCircle, Folder, CornerLeftUp, Search } from "lucide-react";

export default function Dashboard() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const [currentPath, setCurrentPath] = useState("");
  const [inputPath, setInputPath] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then(res => res.json()).then(data => {
       if (data.sourceDir) {
          fetchFolders(data.sourceDir);
       } else {
          fetchFolders("");
       }
    });
  }, []);

  const fetchFolders = async (dirToFetch: string) => {
    setLoadingFolders(true);
    try {
        const res = await fetch(`/api/fs?path=${encodeURIComponent(dirToFetch)}`);
        const data = await res.json();
        if (data.success) {
            setCurrentPath(data.currentPath);
            setInputPath(data.currentPath);
            setFolders(data.directories);
        } else {
            toast.error(data.error || "读取目录失败");
        }
    } catch {
        toast.error("读取目录发生错误");
    } finally {
        setLoadingFolders(false);
    }
  }

  const navigateUp = () => {
      const parts = currentPath.replace(/\/$/, "").replace(/\\$/, "").split(/[/\\]/);
      parts.pop();
      let parent = parts.join("/");
      
      // 处理 Windows 盘符根目录
      if (parent.endsWith(":")) {
         parent += "/"; 
      }
      
      // 处理 Linux/Mac 根目录
      if (currentPath.startsWith("/") && parent === "") {
         parent = "/";
      }

      if (!parent) {
          fetchFolders(""); // 只有彻底为空（最初始状态无记录）才由后端 fallback
      } else {
          fetchFolders(parent);
      }
  }

  const navigateTo = (folderName: string) => {
      const sep = currentPath.endsWith("\\") || currentPath.endsWith("/") ? "" : "/";
      fetchFolders(currentPath + sep + folderName);
  }

  const handleScan = async (useCustom: boolean) => {
    setScanning(true);
    setResults([]);
    try {
      const reqBody = useCustom ? { customDir: currentPath } : {};
      const res = await fetch("/api/scan", { 
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody) 
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "已经开始前往后台逐个执行，你可以去处理队列查看了。");
      } else {
        toast.error(data.error || "触发扫描时出错");
      }
    } catch {
      toast.error("触发扫描时发生网络错误");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">控制面板</h2>
        <p className="text-zinc-400 mt-1">Reanime 自动化处理引擎运行概况与局部扫描控制。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Global Trigger */}
        <Card className="bg-zinc-900 border-zinc-800 flex flex-col">
          <CardHeader>
            <CardTitle>默认扫描 (全局)</CardTitle>
            <CardDescription>扫描系统设置中配置的默认“监控源目录”。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 items-end pb-6">
            <Button onClick={() => handleScan(false)} disabled={scanning} size="lg" className="w-full bg-indigo-600 hover:bg-indigo-700 h-16 text-lg font-medium shadow-xl shadow-indigo-900/20">
              <PlayCircle className="mr-3" size={24} /> {scanning ? "正在读取并扫描目录中..." : "立刻扫描系统默认源"}
            </Button>
          </CardContent>
        </Card>

        {/* Directory Browser */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>自定义目录处理</CardTitle>
            <CardDescription>在服务器资源库中直接浏览并选取指定的文件夹进行解析转移。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={navigateUp} className="bg-zinc-950 border-zinc-800 shrink-0">
                    <CornerLeftUp size={18} />
                </Button>
                <div className="flex-1 flex gap-2">
                   <Input 
                        value={inputPath} 
                        onChange={(e) => setInputPath(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 font-mono text-sm" 
                        onKeyDown={(e) => { if (e.key === 'Enter') fetchFolders(inputPath); }}
                   />
                   <Button variant="secondary" onClick={() => fetchFolders(inputPath)} className="shrink-0 bg-zinc-800 hover:bg-zinc-700">
                       <Search size={16} />
                   </Button>
                </div>
             </div>

             <div className="h-48 overflow-y-auto border border-zinc-800/50 rounded-lg p-2 bg-zinc-950/30">
                 {loadingFolders ? (
                     <p className="p-4 text-sm text-zinc-500 text-center flex items-center justify-center h-full">读取中...</p>
                 ) : folders.length === 0 ? (
                     <p className="p-4 text-sm text-zinc-500 text-center flex items-center justify-center h-full">此目录下没有任何子文件夹。</p>
                 ) : (
                     <ul className="space-y-1">
                         {folders.map(f => (
                             <li key={f}>
                                 <button 
                                     onClick={() => navigateTo(f)}
                                     className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/80 rounded transition-colors text-left text-sm font-medium text-zinc-300 hover:text-white"
                                 >
                                     <Folder className="text-blue-400" size={16} fill="currentColor" fillOpacity={0.2} /> {f}
                                 </button>
                             </li>
                         ))}
                     </ul>
                 )}
             </div>

             <Button onClick={() => handleScan(true)} disabled={scanning} className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20">
                 处理左上文本框中指定的路径
             </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results Header */}
      {results.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>本次运行结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/50">
                  {r.status === "SUCCESS" ? (
                    <ShieldCheck className="text-emerald-500 mt-0.5 shrink-0" size={20} />
                  ) : (
                    <AlertCircle className="text-rose-500 mt-0.5 shrink-0" size={20} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200 truncate">{r.file}</p>
                    {r.status === "SUCCESS" && r.target && (
                       <p className="text-xs text-zinc-500 mt-1 font-mono break-all line-clamp-2">↳ {r.target}</p>
                    )}
                    {r.status === "FAILED" && (
                       <p className="text-xs text-rose-400 mt-1 line-clamp-2">错误: {r.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
