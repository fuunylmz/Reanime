"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, Image as ImageIcon } from "lucide-react";

function LibraryCard({ item }: { item: any }) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/library/tmdb?id=${item.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDetails(data.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [item.id]);

  return (
    <Card className="bg-zinc-900 border-zinc-800 shadow-xl overflow-hidden flex flex-row">
      <div className="w-32 sm:w-40 bg-zinc-800 shrink-0 relative flex items-center justify-center min-h-[180px]">
        {loading ? (
          <Loader2 className="animate-spin text-zinc-500" />
        ) : details && details.poster_path ? (
          <img 
            src={details.poster_path} 
            alt={item.name} 
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="text-zinc-600" size={32} />
        )}
      </div>
      <div className="flex-1 p-5 lg:p-6 flex flex-col justify-start">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="text-xl font-bold text-zinc-100">
            {details ? details.name : item.name}
          </h3>
          {(details?.original_name && details.original_name !== details.name) && (
            <span className="text-sm text-zinc-400">
              ({details.original_name})
            </span>
          )}
        </div>
        
        <div className="mt-1 text-xs text-zinc-500 flex items-center gap-4">
          {details?.first_air_date && (
            <span>
              {details.first_air_date.replace(/-/g, "年").replace(/(\d{4}年)(\d{2})(\d{2})/, "$1$2月$3日")}
            </span>
          )}
          <span>共收录 {item.fileCount} 个文件</span>
        </div>

        <div className="mt-4 text-sm text-zinc-400 line-clamp-3 leading-relaxed">
          {details?.overview ? details.overview : loading ? "正在加载简介..." : "暂无简介。"}
        </div>
      </div>
    </Card>
  );
}

export default function LibraryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/library")
      .then(res => res.json())
      .then(data => {
        if (data.success) setItems(data.items);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">媒体档案</h2>
        <p className="text-zinc-400 mt-1">浏览已通过 AI 解析并成功归档链接到本地媒体库的影视资源。</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin text-zinc-500" />
          <span className="ml-3 text-zinc-400">正在载入档案...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          媒体库目前为空。请在处理队列中扫描添加一些资源！
        </div>
      ) : (
        <div className="space-y-5">
          {items.map(item => (
            <LibraryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
