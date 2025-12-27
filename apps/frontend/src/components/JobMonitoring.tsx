import React, { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Calendar,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { monitoringApi, postsApi } from "../lib/api";

interface JobRecord {
  id: string;
  name: string;
  state: string;
  data: Record<string, unknown>;
  progress?: number;
  returnvalue?: unknown;
  failedReason?: string;
  attemptsMade: number;
  maxAttempts: number;
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
}

interface RecentJobsData {
  active: JobRecord[];
  completed: JobRecord[];
  failed: JobRecord[];
  delayed: JobRecord[];
}

interface HealthData {
  status: "healthy" | "degraded" | "unhealthy";
  stats: {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    delayedJobs: number;
    waitingJobs: number;
  };
  healthScore: number;
  lastCompletedJob?: { id: string; timestamp: number };
  failureRate: number;
}

interface StatsData {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  delayedJobs: number;
  waitingJobs: number;
}

export const JobMonitoring: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJobsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "active" | "scheduled" | "completed" | "failed"
  >("overview");

  const fetchMonitoringData = useCallback(async () => {
    try {
      setLoading(true);
      const [healthData, statsData, jobsData] = await Promise.all([
        monitoringApi.getQueueHealth(),
        monitoringApi.getQueueStats(),
        monitoringApi.getRecentJobs(30),
      ]);
      setHealth(healthData);
      setStats(statsData);
      setRecentJobs(jobsData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch monitoring data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRetry = async (postId: string) => {
    try {
      setRetrying(postId);
      await postsApi.retryPost(postId);
      // Refresh monitoring data after retry
      await fetchMonitoringData();
    } catch (error) {
      console.error("Failed to retry post:", error);
      alert("Failed to retry post. Please try again.");
    } finally {
      setRetrying(null);
    }
  };

  useEffect(() => {
    fetchMonitoringData();
    const interval = setInterval(fetchMonitoringData, 10000);
    return () => clearInterval(interval);
  }, [fetchMonitoringData]);

  const getHealthColor = (status: string): string => {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-50";
      case "degraded":
        return "text-yellow-600 bg-yellow-50";
      case "unhealthy":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  if (!health || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job Queue Monitoring</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            Loading monitoring data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Job Queue Monitor</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lastUpdated && `Last updated: ${lastUpdated.toLocaleTimeString()}`}
          </p>
        </div>
        <Button
          onClick={fetchMonitoringData}
          disabled={loading}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`rounded-lg p-6 flex items-center gap-4 ${getHealthColor(
              health.status
            )}`}
          >
            {health.status === "healthy" && (
              <CheckCircle size={32} className="flex-shrink-0" />
            )}
            {health.status !== "healthy" && (
              <AlertCircle size={32} className="flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="font-semibold capitalize">{health.status} Status</p>
              <p className="text-sm opacity-75">
                Health Score: {health.healthScore}% | Failure Rate:{" "}
                {health.failureRate}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats.totalJobs}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Total Jobs
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500 flex items-center justify-center gap-2">
                <Zap size={20} />
                {stats.activeJobs}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Active</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-2">
                <CheckCircle size={20} />
                {stats.completedJobs}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Completed
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {stats.failedJobs}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Failed</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-2">
                <Clock size={20} />
                {stats.delayedJobs + stats.waitingJobs}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Pending</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-2 border-b">
            {(
              [
                "overview",
                "active",
                "scheduled",
                "completed",
                "failed",
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "overview" && "Overview"}
                {tab === "active" &&
                  `Active (${recentJobs?.active?.length || 0})`}
                {tab === "scheduled" &&
                  `Scheduled (${recentJobs?.delayed?.length || 0})`}
                {tab === "completed" &&
                  `Completed (${recentJobs?.completed?.length || 0})`}
                {tab === "failed" &&
                  `Failed (${recentJobs?.failed?.length || 0})`}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">
                    Active Jobs
                  </p>
                  <p className="text-3xl font-bold mt-2">{stats.activeJobs}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Currently processing
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground">
                    Queue Health
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          health.healthScore >= 80
                            ? "bg-green-500"
                            : health.healthScore >= 50
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${health.healthScore}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-semibold">
                      {health.healthScore}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Failure Rate
                </p>
                <p className="text-2xl font-bold">
                  {health.failureRate.toFixed(2)}%
                </p>
                {health.lastCompletedJob && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Last completed:{" "}
                    {new Date(
                      health.lastCompletedJob.timestamp
                    ).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "active" && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {!recentJobs?.active || recentJobs.active.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No active jobs
                </p>
              ) : (
                recentJobs.active.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 border rounded-lg flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{job.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.name} • {job.attemptsMade + 1}/{job.maxAttempts}{" "}
                        attempts
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.progress && job.progress > 0 && (
                        <div className="w-16 h-2 bg-gray-200 rounded-full">
                          <div
                            className="h-2 bg-blue-500 rounded-full transition-all"
                            style={{ width: `${job.progress}%` }}
                          ></div>
                        </div>
                      )}
                      <span className="text-xs font-semibold text-blue-600">
                        {job.progress || 0}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "scheduled" && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {!recentJobs?.delayed || recentJobs.delayed.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No scheduled jobs
                </p>
              ) : (
                recentJobs.delayed.map((job) => {
                  const scheduledTime = job.timestamp
                    ? new Date(job.timestamp)
                    : null;
                  const postData = job.data as {
                    postId?: string;
                    content?: string;
                  };
                  const contentPreview = postData.content
                    ? postData.content.length > 80
                      ? postData.content.substring(0, 80) + "..."
                      : postData.content
                    : "No content";

                  return (
                    <div
                      key={job.id}
                      className="p-3 border rounded-lg hover:bg-gray-50 bg-yellow-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar size={14} className="text-yellow-600" />
                            <p className="font-medium text-sm">{job.id}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {contentPreview}
                          </p>
                          {scheduledTime && (
                            <p className="text-xs font-semibold text-yellow-700">
                              📅 Scheduled: {scheduledTime.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "completed" && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {!recentJobs?.completed || recentJobs.completed.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No completed jobs
                </p>
              ) : (
                recentJobs.completed.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 border rounded-lg flex items-center justify-between hover:bg-gray-50 bg-green-50"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{job.id}</p>
                      <p className="text-xs text-muted-foreground">
                        Completed at{" "}
                        {job.finishedOn
                          ? new Date(job.finishedOn).toLocaleTimeString()
                          : "Unknown"}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-green-600">
                      ✓ Success
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "failed" && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {!recentJobs?.failed || recentJobs.failed.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No failed jobs
                </p>
              ) : (
                recentJobs.failed.map((job) => {
                  const postData = job.data as { postId?: string };
                  const postId = postData.postId;

                  return (
                    <div
                      key={job.id}
                      className="p-3 border rounded-lg hover:bg-gray-50 bg-red-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{job.id}</p>
                          <p className="text-xs text-red-600 mb-2">
                            {job.failedReason || "Unknown error"} • Attempt{" "}
                            {job.attemptsMade}/{job.maxAttempts}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-red-600">
                            ✗ Failed
                          </span>
                          {postId && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRetry(postId)}
                              disabled={retrying === postId}
                              className="gap-1 h-7 px-2 text-xs"
                            >
                              <RotateCcw
                                size={12}
                                className={
                                  retrying === postId ? "animate-spin" : ""
                                }
                              />
                              {retrying === postId ? "Retrying..." : "Retry"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
