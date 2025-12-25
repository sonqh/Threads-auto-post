import axios from "axios";

const API_BASE_URL = "/api";

export interface Post {
  _id: string;
  excelId?: string;
  topic?: string;
  content: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  skipAI?: boolean;
  threadsPostId?: string;
  postType: "TEXT" | "IMAGE" | "CAROUSEL" | "VIDEO";
  comment?: string;
  videoUrl?: string;
  imageUrls: string[];
  mergeLinks?: string;
  scheduledAt?: string;
  publishedAt?: string;
  jobId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostsResponse {
  data: Post[];
  total: number;
  limit: number;
  skip: number;
}

export const postsApi = {
  async getPosts(params?: {
    status?: string;
    limit?: number;
    skip?: number;
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

  async schedulePost(id: string, scheduledAt: string): Promise<Post> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/schedule`, {
      scheduledAt,
    });
    return response.data;
  },

  async cancelSchedule(id: string): Promise<Post> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/cancel`);
    return response.data;
  },

  async publishPost(id: string): Promise<{
    success: boolean;
    threadsPostId?: string;
    error?: string;
    post?: Post;
  }> {
    const response = await axios.post(`${API_BASE_URL}/posts/${id}/publish`);
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
