export interface LogEntry {
  time: number;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

export interface TaskState {
  id: string;
  fileName: string;
  fullPath: string;
  status: "pending" | "processing" | "success" | "error";
  currentStep: string;
  progress: number;
  logs: LogEntry[];
  startTime: number;
  endTime?: number;
  streamData?: string;
}

/**
 * 内存队列中最多保留的任务数量。
 * 超出后自动淘汰最早完成的任务，防止长期运行导致 OOM。
 */
const MAX_TASKS = 500;

const g = globalThis as unknown as { __tasks: Map<string, TaskState> };
if (!g.__tasks) g.__tasks = new Map();
export const taskManager = g.__tasks;

/**
 * 淘汰已完成的旧任务，保持内存占用可控。
 * 优先移除已完成（success/error）且最老的任务。
 */
export function evictOldTasks() {
  if (taskManager.size <= MAX_TASKS) return;

  const completedTasks = Array.from(taskManager.entries())
    .filter(([, t]) => t.status === "success" || t.status === "error")
    .sort((a, b) => (a[1].startTime) - (b[1].startTime));

  const toRemove = taskManager.size - MAX_TASKS;
  for (let i = 0; i < Math.min(toRemove, completedTasks.length); i++) {
    taskManager.delete(completedTasks[i][0]);
  }
}

export function getSafeTasks() {
  return Array.from(taskManager.values()).sort((a, b) => b.startTime - a.startTime);
}

export function updateTask(id: string, updates: Partial<TaskState>) {
  const t = taskManager.get(id);
  if (t) {
    Object.assign(t, updates);
  }
}

export function addLog(id: string, message: string, level: "info" | "warn" | "error" | "success" = "info") {
  const t = taskManager.get(id);
  if (t) {
    t.logs.push({ time: Date.now(), message, level });
  }
}

export function clearAllTasks() {
  taskManager.clear();
}
