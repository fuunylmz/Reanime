"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, Folder, FileVideo } from "lucide-react";

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [forceTick, setForceTick] = useState(0);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const fetchTasksLoop = async () => {
      try {
        const res = await fetch("/api/tasks");
        const data = await res.json();
        if (data.success) {
            setTasks(data.tasks);
            // 检测是否需要高频心跳
            isProcessingRef.current = data.tasks.some((t: any) => t.status === "processing" || t.status === "pending");
        }
      } catch (e) {}

      setForceTick(v => v + 1);
      // 若当前处在活跃读写期，加速轮询至 300 毫秒(0.3秒)实现流畅的 Token 瀑布流，否则回退到 2000 毫秒防消耗
      timeoutId = setTimeout(fetchTasksLoop, isProcessingRef.current ? 300 : 2000);
    };

    fetchTasksLoop();
    return () => clearTimeout(timeoutId);
  }, []);

  const toggleGroup = (folder: string) => {
    setExpandedGroups(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  const toggleTask = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedTasks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const groupedTasks = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const t of tasks) {
       const parts = t.fullPath.split(/[/\\]/);
       parts.pop(); 
       const folderName = parts.length > 0 ? parts.join("\\") : "根目录";
       
       if (!groups[folderName]) groups[folderName] = [];
       groups[folderName].push(t);
    }
    return groups;
  }, [tasks]);

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">资源处理队列</h2>
        <p className="text-zinc-400 mt-1">控制台已折叠，按“源目标文件夹”进行分类。支持大模型光速流式响应 (Live Streaming)。</p>
      </div>

      <div className="space-y-4">
        {Object.keys(groupedTasks).length === 0 ? (
          <div className="p-8 text-center text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            目前后台空闲，没有正在排队或历史任务。
          </div>
        ) : (
          Object.entries(groupedTasks).map(([folderName, folderTasks], index) => {
            const isExpanded = expandedGroups[folderName] !== undefined 
               ? expandedGroups[folderName] 
               : (Object.keys(groupedTasks).length === 1);

            const total = folderTasks.length;
            const successCount = folderTasks.filter(t => t.status === "success").length;
            const errorCount = folderTasks.filter(t => t.status === "error").length;
            const isComplete = successCount + errorCount === total;
            const isProcessing = folderTasks.some(t => t.status === "processing" || t.status === "pending");

            const shortFolderName = folderName.split(/[/\\]/).pop();

            return (
              <Card key={folderName} className="bg-zinc-900/80 border-zinc-800 shadow-xl overflow-hidden transition-all duration-300">
                
                {/* Folder Group Header */}
                <div 
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between cursor-pointer hover:bg-zinc-800/80 transition-colors"
                  onClick={() => toggleGroup(folderName)}
                  style={{ borderBottom: isExpanded ? '1px solid rgba(39, 39, 42, 0.5)' : 'none' }}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
                    <div className="p-2.5 bg-indigo-500/10 rounded-lg shrink-0">
                      <Folder className="text-indigo-400" size={24} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-lg text-zinc-200 truncate" title={folderName}>
                        {shortFolderName}
                      </h3>
                      <p className="text-xs text-zinc-500 truncate mt-0.5" title={folderName}>{folderName}</p>
                    </div>
                  </div>

                  <div className="mt-4 md:mt-0 flex items-center gap-4 shrink-0 pl-16 md:pl-0">
                    <div className="flex gap-2">
                      {isProcessing && (
                         <Badge variant="outline" className="text-blue-400 border-blue-400/30 bg-blue-400/10">
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin"/>处理中 ({successCount + errorCount}/{total})
                         </Badge>
                      )}
                      {!isProcessing && isComplete && (
                         <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">处理完成 ({total})</Badge>
                      )}
                      {errorCount > 0 && (
                         <Badge variant="destructive">{errorCount} 失败</Badge>
                      )}
                    </div>
                    <button className="text-zinc-500 hover:text-white p-1 rounded-full transition-colors focus:outline-none ml-2">
                       {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                    </button>
                  </div>
                </div>

                {/* Group Content */}
                {isExpanded && (
                  <div className="bg-zinc-950/50 divide-y divide-zinc-800/50">
                    {folderTasks.map(task => (
                      <div key={task.id} className="flex flex-col">
                        <div 
                          className="p-3.5 pl-6 flex flex-col md:flex-row md:items-center justify-between cursor-pointer hover:bg-zinc-800/40 transition-colors"
                          onClick={(e) => toggleTask(e, task.id)}
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-3">
                              <FileVideo size={16} className="text-zinc-600 shrink-0" />
                              <span className="font-medium text-zinc-300 text-sm truncate" title={task.fileName}>{task.fileName}</span>
                              {task.status === "processing" || task.status === "pending" ? (
                                <Badge variant="outline" className="text-blue-400 border-blue-400/30 bg-blue-400/10 h-5 px-1.5 text-[10px]">运算中</Badge>
                              ) : task.status === "success" ? (
                                <CheckCircle2 className="text-emerald-600 shrink-0" size={16} />
                              ) : (
                                <XCircle className="text-rose-600 shrink-0" size={16} />
                              )}
                            </div>
                            <div className="mt-1.5 pl-7">
                               <p className="text-xs text-zinc-500 flex items-center gap-2">
                                 {task.status === "processing" ? <Loader2 className="animate-spin text-blue-400" size={12} /> : null}
                                 当前状态阶段: <span className="text-zinc-400">{task.currentStep}</span>
                               </p>
                               {/* Real-time Streaming JSON Data Rendering */}
                               {task.streamData && (
                                  <div className="mt-2.5">
                                    <pre className="text-[10px] text-emerald-400/80 font-mono bg-black/60 border border-zinc-800/80 p-2.5 rounded-lg max-h-32 overflow-y-auto w-full whitespace-pre-wrap shadow-inner custom-scrollbar relative">
                                        <div className="absolute top-1.5 right-2 flex space-x-1 items-center">
                                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                                        </div>
                                        {task.streamData}
                                    </pre>
                                  </div>
                               )}
                            </div>
                          </div>
                          
                          <div className="mt-2 md:mt-0 flex items-center gap-4 text-xs text-zinc-600 shrink-0 pl-7 md:pl-0">
                            <div className="flex items-center gap-1 font-mono">
                              <Clock size={12} /> 历时: {task.endTime ? ((task.endTime - task.startTime) / 1000).toFixed(1) : ((Date.now() - task.startTime) / 1000).toFixed(1)}s
                            </div>
                            <span className="text-zinc-600 hover:text-white p-0.5 rounded-full hover:bg-zinc-800 transition-colors">
                              {expandedTasks[task.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </span>
                          </div>
                        </div>

                        {/* Detail Task Logs */}
                        {expandedTasks[task.id] && (
                          <div className="bg-[#09090b] pl-14 pr-4 py-4 border-t border-zinc-800/30 shadow-inner">
                            <div className="space-y-2.5 font-mono text-[11px]">
                              {task.logs.map((log: any, idx: number) => (
                                <div key={idx} className="flex gap-4 items-start">
                                  <span className="text-zinc-700 shrink-0 select-none">[{new Date(log.time).toLocaleTimeString()}]</span>
                                  <span className={
                                    log.level === "error" ? "text-rose-400 font-semibold" :
                                    log.level === "success" ? "text-emerald-400" :
                                    log.level === "warn" ? "text-amber-400" : "text-zinc-400"
                                  }>
                                    {log.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
