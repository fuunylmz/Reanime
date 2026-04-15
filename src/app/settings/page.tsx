"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, RefreshCw, Activity } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    openaiKey: "",
    openaiBaseURL: "",
    openaiModel: "gpt-4o-mini",
    tmdbKey: "",
    sourceDir: "",
    targetDir: "",
    targetDirAnime: "",
    targetDirTV: "",
    targetDirMovie: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingConn, setTestingConn] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then(res => res.json()).then(data => {
      setConfig({
        openaiKey: data.openaiKey || "",
        openaiBaseURL: data.openaiBaseURL || "",
        openaiModel: data.openaiModel || "gpt-4o-mini",
        tmdbKey: data.tmdbKey || "",
        sourceDir: data.sourceDir || "",
        targetDir: data.targetDir || "",
        targetDirAnime: data.targetDirAnime || "",
        targetDirTV: data.targetDirTV || "",
        targetDirMovie: data.targetDirMovie || "",
      });
      setLoading(false);
    });
  }, []);

  const handleTestConnection = async () => {
    if (!config.openaiKey) {
        toast.error("请先输入 API 密钥！");
        return;
    }
    setTestingConn(true);
    try {
        const res = await fetch("/api/test-connection", {
            method: "POST",
            body: JSON.stringify({ apiKey: config.openaiKey, baseURL: config.openaiBaseURL, model: config.openaiModel })
        });
        const data = await res.json();
        if (data.success) {
            toast.success("测试通过：" + data.message);
        } else {
            toast.error(data.error || "连接端点失败，请检查设置。");
        }
    } catch {
        toast.error("发生网络错误，连接端点失败。");
    } finally {
        setTestingConn(false);
    }
  };

  const handleFetchModels = async () => {
    if (!config.openaiKey) {
        toast.error("请先输入 API 密钥！");
        return;
    }
    setFetchingModels(true);
    try {
        const res = await fetch("/api/models", {
            method: "POST",
            body: JSON.stringify({ apiKey: config.openaiKey, baseURL: config.openaiBaseURL })
        });
        const data = await res.json();
        if (data.success) {
            setAvailableModels(data.models);
            toast.success(`成功获取到 ${data.models.length} 个模型。`);
            if (data.models.length > 0 && !data.models.includes(config.openaiModel)) {
                setConfig({ ...config, openaiModel: data.models[0] });
            }
        } else {
            toast.error(data.error || "获取模型列表失败。");
        }
    } catch {
        toast.error("网络错误，无法拉取模型列表。");
    } finally {
        setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        body: JSON.stringify(config)
      });
      if (res.ok) {
        toast.success("系统设置已成功保存！");
      } else {
        toast.error("保存设置时失败。");
      }
    } catch {
      toast.error("保存设置时发生网络错误。");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-zinc-400 mt-1">管理全局运行配置、源目录及第三方大模型与 TMDB 的密钥。</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>OpenAI 大模型协议接入</CardTitle>
          <CardDescription>配置用于智能文件名解析及元数据抽取的跨平台大语言模型端点。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openaiKey">API 密钥 (API Key)</Label>
            <Input 
              id="openaiKey" type="password" 
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500"
              value={config.openaiKey} onChange={e => setConfig({ ...config, openaiKey: e.target.value })}
              placeholder="sk-..." 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openaiBaseURL">端点地址 (Base URL) - 选填</Label>
            <div className="flex gap-3">
              <Input 
                id="openaiBaseURL" 
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500 w-full"
                value={config.openaiBaseURL} onChange={e => setConfig({ ...config, openaiBaseURL: e.target.value })}
                placeholder="如 https://api.openai.com/v1" 
              />
              <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testingConn} className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 whitespace-nowrap">
                  <Activity className={`mr-2 h-4 w-4 ${testingConn ? 'animate-pulse' : ''}`} /> {testingConn ? "测试中..." : "测试连接"}
              </Button>
            </div>
            <p className="text-xs text-zinc-500">如果使用第三方中转接口或本地模型（如 Ollama），请填入基础 URL；留空则使用官方默认端点。</p>
          </div>
          
          <div className="space-y-2">
            <Label>模型选择 (Model)</Label>
            <div className="flex gap-3">
              <Select value={config.openaiModel || ""} onValueChange={(val) => setConfig({ ...config, openaiModel: val || "gpt-4o-mini" })}>
                <SelectTrigger className="w-full bg-zinc-950 border-zinc-800">
                  <SelectValue placeholder="手动输入或自动获取模型..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
                  {availableModels.length > 0 ? availableModels.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  )) : (
                    <SelectItem value={config.openaiModel || "gpt-4o-mini"}>{config.openaiModel || "gpt-4o-mini"}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={handleFetchModels} disabled={fetchingModels} className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 whitespace-nowrap">
                  <RefreshCw className={`mr-2 h-4 w-4 ${fetchingModels ? 'animate-spin' : ''}`} /> {fetchingModels ? "获取中..." : "获取支持的模型"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>TMDB API 设置</CardTitle>
          <CardDescription>提供获取标准剧集资料（中译名、ID和首播年份）的能力，让剧集命名标准化。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tmdbKey">TMDB 访问令牌 (Access Token 或 API Key)</Label>
            <Input 
              id="tmdbKey" type="password" 
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500"
              value={config.tmdbKey} onChange={e => setConfig({ ...config, tmdbKey: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>本地目录库位置</CardTitle>
          <CardDescription>配置下载监听扫描的目录及向最终媒体库发起链接的目标存放点（绝对路径）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sourceDir">下载监听目录 (监控源)</Label>
            <Input 
              id="sourceDir" 
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500"
              value={config.sourceDir} onChange={e => setConfig({ ...config, sourceDir: e.target.value })}
              placeholder="例如：C:\Downloads\PT" 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetDir">目标 Emby/Jellyfin 目录 (链接归档处)</Label>
            <Input 
              id="targetDir" 
              className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500"
              value={config.targetDir} onChange={e => setConfig({ ...config, targetDir: e.target.value })}
              placeholder="例如：D:\EmbyMedia\Anime" 
            />
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300">自动分类目标目录配置 (智能分发)</h3>
              <p className="text-xs text-zinc-500 mb-2">如果留空，则默认使用上方的总目标目录。设置后，大模型会自动判断影视类型并分散存放入对应目录。</p>
              <div className="space-y-2">
                <Label htmlFor="targetDirAnime">动漫番剧目录 (Anime)</Label>
                <Input 
                  id="targetDirAnime" 
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500"
                  value={config.targetDirAnime || ""} onChange={e => setConfig({ ...config, targetDirAnime: e.target.value })}
                  placeholder="例如：D:\EmbyMedia\Anime" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetDirTV">电视剧集目录 (TV Shows)</Label>
                <Input 
                  id="targetDirTV" 
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500"
                  value={config.targetDirTV || ""} onChange={e => setConfig({ ...config, targetDirTV: e.target.value })}
                  placeholder="例如：D:\EmbyMedia\TV" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetDirMovie">电影目录 (Movies)</Label>
                <Input 
                  id="targetDirMovie" 
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-500"
                  value={config.targetDirMovie || ""} onChange={e => setConfig({ ...config, targetDirMovie: e.target.value })}
                  placeholder="例如：D:\EmbyMedia\Movies" 
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end pt-4 pb-6 px-6">
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white min-w-32">
            <Save className="mr-2" size={16} /> {saving ? "保存中..." : "保存系统设置"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
