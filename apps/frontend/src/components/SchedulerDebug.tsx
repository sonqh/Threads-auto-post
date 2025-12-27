import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";

interface SchedulerLog {
  timestamp: string;
  message: string;
  type: "info" | "error" | "warning" | "success";
}

interface QueueStats {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  delayedJobs: number;
  waitingJobs: number;
}

export const SchedulerDebug: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<SchedulerLog[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds

  // Fetch queue stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/posts/monitoring/stats");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();

      setStats(data);

      // Add log entry
      const newLog: SchedulerLog = {
        timestamp: new Date().toLocaleTimeString(),
        message: `Stats: Active=${data.activeJobs}, Completed=${data.completedJobs}, Failed=${data.failedJobs}, Waiting=${data.waitingJobs}`,
        type: "success",
      };

      setLogs((prev) => [newLog, ...prev].slice(0, 50)); // Keep last 50 logs
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const newLog: SchedulerLog = {
        timestamp: new Date().toLocaleTimeString(),
        message: `Failed to fetch stats: ${errorMsg}`,
        type: "error",
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 50));
      console.error("Stats fetch error:", error);
    }
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const timerId = setTimeout(() => {
      fetchStats();
    }, 0);

    const interval = setInterval(fetchStats, refreshInterval);
    return () => {
      clearTimeout(timerId);
      clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval, fetchStats]);

  const getLogColor = (type: string) => {
    switch (type) {
      case "error":
        return "text-red-600 bg-red-50";
      case "warning":
        return "text-yellow-600 bg-yellow-50";
      case "success":
        return "text-green-600 bg-green-50";
      default:
        return "text-blue-600 bg-blue-50";
    }
  };

  return (
    <div className="fixed bottom-0 right-0 w-96 max-h-96 bg-white border-l border-t border-gray-200 shadow-lg rounded-tl-lg overflow-hidden z-40">
      {/* Header */}
      <div
        className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-200 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">🔍 Scheduler Debug</h3>
          {stats && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
              {stats.totalJobs} jobs
            </span>
          )}
        </div>
        <ChevronDown
          size={20}
          className={`transition transform ${isOpen ? "" : "rotate-180"}`}
        />
      </div>

      {/* Content */}
      {isOpen && (
        <div className="flex flex-col h-96">
          {/* Stats Bar */}
          {stats && (
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="font-semibold text-green-600">
                  {stats.activeJobs}
                </div>
                <div className="text-gray-600">Active</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-blue-600">
                  {stats.waitingJobs}
                </div>
                <div className="text-gray-600">Waiting</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-purple-600">
                  {stats.completedJobs}
                </div>
                <div className="text-gray-600">Done</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-red-600">
                  {stats.failedJobs}
                </div>
                <div className="text-gray-600">Failed</div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="border-b border-gray-200 px-4 py-2 flex items-center gap-2">
            <button
              onClick={fetchStats}
              className="p-1 hover:bg-gray-100 rounded transition"
              title="Refresh now"
            >
              <RefreshCw size={16} />
            </button>
            <label className="text-xs flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto
            </label>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded px-1 py-0.5"
            >
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
          </div>

          {/* Logs */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="text-gray-400 py-4 text-center">No logs yet</div>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`${getLogColor(log.type)} p-1 rounded`}
                >
                  <span className="text-gray-600">[{log.timestamp}]</span>{" "}
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
