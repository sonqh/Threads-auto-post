import axios from "axios";

const API_BASE_URL = "/api";

export interface Post {
  _id: string;
  excelId?: string;
  topic?: string;
  content: string;
  status: "DRAFT" | "PUBLISHING" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  skipAI?: boolean;
  threadsPostId?: string;
  postType: "TEXT" | "IMAGE" | "CAROUSEL" | "VIDEO";
  comment?: string;
  videoUrl?: string;
  imageUrls: string[];
  mergeLinks?: string;
  scheduledAt?: string;
  scheduleConfig?: {
    pattern: "ONCE" | "WEEKLY" | "MONTHLY" | "DATE_RANGE";
    scheduledAt: string;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
    time?: string;
  };
  publishingProgress?: {
    status: "pending" | "publishing" | "published" | "failed";
    startedAt?: string;
    completedAt?: string;
    currentStep?: string;
    error?: string;
  };
  publishedAt?: string;
  jobId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostsResponse {
  posts: Post[];
  total: number;
  limit: number;
  skip: number;
}

export interface JobRecord {
  id: string;
  name: string;
  state: string;
  data: {
    postId?: string;
    content?: string;
    [key: string]: unknown;
  };
  progress?: number;
  returnvalue?: unknown;
  failedReason?: string;
  attemptsMade: number;
  maxAttempts: number;
  timestamp?: number;
  processedOn?: number;
  finishedOn?: number;
  scheduledAt?: number;
}

export const postsApi = {
  async getPosts(params?: {
    status?: string;
    limit?: number;
    skip?: number;
    accountId?: string;
  }): Promise<PostsResponse> {
    const response = await axios.get(`${API_BASE_URL}/posts`, { params });
    return response.data;
  },

  async getPost(id: string): Promise<Post> {
    const response = await axios.get(`${API_BASE_URL}/posts/${id}`);
    return response.data;
  },

  async createPost(data: Partial<Post>): Promise<Post> {
    const response = await axios.post(`${API_BASE_URL}/posts`, data);
    return response.data;
  },

  async updatePost(id: string, data: Partial<Post>): Promise<Post> {
    const response = await axios.put(`${API_BASE_URL}/posts/${id}`, data);
    return response.data;
  },

  async deletePost(id: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/posts/${id}`);
  },

  async bulkDelete(ids: string[]): Promise<{
    success: boolean;
    deletedCount: number;
    message: string;
  }> {
    const response = await axios.post(`${API_BASE_URL}/excel/bulk-delete`, {
      postIds: ids,
    });
    return response.data;
  },

  async schedulePost(
    id: string,
    config: {
      pattern: "ONCE" | "WEEKLY" | "MONTHLY" | "DATE_RANGE";
      scheduledAt: string;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      endDate?: string;
      time?: string;
    },
    accountIds?: string[]
  ): Promise<Post> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/schedule`, {
      ...config,
      accountIds,
    });
    return response.data;
  },

  async scheduleToMultipleAccounts(
    id: string,
    config: {
      pattern: "ONCE" | "WEEKLY" | "MONTHLY" | "DATE_RANGE";
      scheduledAt: string;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      endDate?: string;
      time?: string;
    },
    accountIds: string[]
  ): Promise<{
    success: boolean;
    message: string;
    groupId: string;
    posts: Array<{
      _id: string;
      threadsAccountId: string;
      status: string;
      scheduledAt: string;
      bulkPostId: string;
    }>;
  }> {
    const response = await axios.post(
      `${API_BASE_URL}/posts/${id}/schedule-multi-account`,
      {
        ...config,
        accountIds,
      }
    );
    return response.data;
  },

  async getPublishingProgress(id: string): Promise<{

    status: "pending" | "publishing" | "published" | "failed";
    startedAt?: string;
    completedAt?: string;
    currentStep?: string;
    error?: string;
  }> {
    const response = await axios.get(`${API_BASE_URL}/posts/${id}/progress`);
    return response.data;
  },

  async cancelSchedule(id: string): Promise<Post> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/cancel`);
    return response.data;
  },

  async publishPost(
    id: string,
    accountId?: string
  ): Promise<{
    success: boolean;
    threadsPostId?: string;
    error?: string;
    post?: Post;
  }> {
    const response = await axios.post(
      `${API_BASE_URL}/posts/${id}/publish`,
      accountId ? { accountId } : {}
    );
    return response.data;
  },

  async bulkSchedule(
    postIds: string[],
    startTime: string,
    endTime: string,
    options?: {
      randomizeOrder?: boolean;
      seed?: number;
      accountId?: string;
    }
  ): Promise<{
    success: boolean;
    count: number;
    posts: Array<{
      postId: string;
      content: string;
      scheduledAt: string;
      status: string;
    }>;
    timeRange: {
      start: string;
      end: string;
      durationMinutes: number;
    };
  }> {
    const response = await axios.post(`${API_BASE_URL}/posts/bulk-schedule`, {
      postIds,
      startTime,
      endTime,
      ...options,
    });
    return response.data;
  },

  async bulkCancel(postIds: string[]): Promise<{
    success: boolean;
    cancelled: number;
    alreadyPublished: number;
    notFound: number;
    total: number;
  }> {
    const response = await axios.post(`${API_BASE_URL}/posts/bulk-cancel`, {
      postIds,
    });
    return response.data;
  },

  async retryPost(id: string): Promise<{
    success: boolean;
    message: string;
    post: Post;
  }> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/retry`);
    return response.data;
  },

  async fixStuckPost(id: string): Promise<{
    success: boolean;
    message: string;
    post: Post;
  }> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/fix-stuck`);
    return response.data;
  },

  async duplicatePost(
    id: string,
    targetAccountIds: string[]
  ): Promise<{
    success: boolean;
    message: string;
    duplicatedPosts: Array<{
      _id: string;
      threadsAccountId: string;
      content: string;
      status: string;
    }>;
  }> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/duplicate`, {
      targetAccountIds,
    });
    return response.data;
  },

  async bulkAssignAccount(
    postIds: string[],
    targetAccountId: string
  ): Promise<{
    success: boolean;
    message: string;
    modifiedCount: number;
  }> {
    const response = await axios.post(
      `${API_BASE_URL}/posts/bulk-assign-account`,
      {
        postIds,
        targetAccountId,
      }
    );
    return response.data;
  },
};

export const monitoringApi = {
  async getQueueStats(): Promise<{
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
    delayedJobs: number;
    waitingJobs: number;
  }> {
    const response = await axios.get(`${API_BASE_URL}/posts/monitoring/stats`);
    return response.data;
  },

  async getQueueHealth(): Promise<{
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
  }> {
    const response = await axios.get(`${API_BASE_URL}/posts/monitoring/health`);
    return response.data;
  },

  async getRecentJobs(limit: number = 50): Promise<{
    active: JobRecord[];
    completed: JobRecord[];
    failed: JobRecord[];
    delayed: JobRecord[];
    scheduled: JobRecord[];
  }> {
    const response = await axios.get(
      `${API_BASE_URL}/posts/monitoring/jobs/recent`,
      {
        params: { limit },
      }
    );
    return response.data;
  },

  async getJobsByState(
    state: "active" | "completed" | "failed" | "delayed" | "waiting",
    limit: number = 20
  ): Promise<JobRecord[]> {
    const response = await axios.get(
      `${API_BASE_URL}/posts/monitoring/jobs/state/${state}`,
      { params: { limit } }
    );
    return response.data;
  },

  async getJobDetails(jobId: string): Promise<JobRecord | null> {
    const response = await axios.get(
      `${API_BASE_URL}/posts/monitoring/jobs/${jobId}`
    );
    return response.data;
  },
};

export const excelApi = {
  async importExcel(file: File): Promise<{
    success: boolean;
    imported: number;
    errors: number;
    posts: Post[];
    errorDetails: Array<{ row: number; error: string }>;
  }> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await axios.post(
      `${API_BASE_URL}/excel/import`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    return response.data;
  },

  async checkDuplicates(file: File): Promise<{
    success: boolean;
    duplicates: Array<{
      rowIndex: number;
      content: string;
      description?: string;
      topic?: string;
      imageUrls?: string[];
      duplicateType: "EXACT" | "CONTENT_ONLY";
      matches: Array<{
        _id: string;
        content: string;
        comment?: string;
        topic?: string;
        imageUrls: string[];
      }>;
    }>;
    totalRows: number;
  }> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await axios.post(
      `${API_BASE_URL}/excel/check-duplicates`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    return response.data;
  },

  async bulkSchedule(
    postIds: string[],
    scheduledAt: string
  ): Promise<{
    success: boolean;
    scheduled: number;
    errors: number;
    posts: Post[];
    errorDetails: Array<{ postId: string; error: string }>;
  }> {
    const response = await axios.post(`${API_BASE_URL}/excel/bulk-schedule`, {
      postIds,
      scheduledAt,
    });
    return response.data;
  },
};

// Aggregated API client for use in components
export const api = {
  get: (path: string, config?: any) =>
    axios.get(`${API_BASE_URL}${path}`, config),
  post: (path: string, data?: any, config?: any) =>
    axios.post(`${API_BASE_URL}${path}`, data, config),
  put: (path: string, data?: any, config?: any) =>
    axios.put(`${API_BASE_URL}${path}`, data, config),
  patch: (path: string, data?: any, config?: any) =>
    axios.patch(`${API_BASE_URL}${path}`, data, config),
  delete: (path: string, config?: any) =>
    axios.delete(`${API_BASE_URL}${path}`, config),
  ...postsApi,
  ...monitoringApi,
  ...excelApi,
};
