import React, { useState, useEffect } from 'react';
import { Trash2, Calendar, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { postsApi, type Post } from '../lib/api';
import { format } from 'date-fns';

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  PUBLISHED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

const STATUS_ICONS = {
  DRAFT: FileText,
  SCHEDULED: Clock,
  PUBLISHED: CheckCircle,
  FAILED: XCircle,
};

export const PostsList: React.FC<{ refresh?: number }> = ({ refresh = 0 }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  useEffect(() => {
    loadPosts();
  }, [selectedStatus, refresh]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const response = await postsApi.getPosts({
        status: selectedStatus || undefined,
        limit: 50,
      });
      setPosts(response.data);
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
      await postsApi.deletePost(id);
      loadPosts();
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
  };

  const handleSchedule = async (id: string) => {
    const scheduledAt = prompt('Enter scheduled time (ISO format, e.g., 2024-01-01T12:00:00)');
    if (!scheduledAt) return;

    try {
      await postsApi.schedulePost(id, scheduledAt);
      loadPosts();
    } catch (error: any) {
      alert('Failed to schedule post: ' + error.message);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await postsApi.cancelSchedule(id);
      loadPosts();
    } catch (error) {
      console.error('Failed to cancel schedule:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posts</CardTitle>
        <CardDescription>Manage your Threads posts</CardDescription>
        <div className="flex gap-2 mt-4">
          <Button
            variant={selectedStatus === '' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedStatus('')}
          >
            All
          </Button>
          {['DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'].map((status) => (
            <Button
              key={status}
              variant={selectedStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStatus(status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No posts found</div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const StatusIcon = STATUS_ICONS[post.status];
              return (
                <div
                  key={post._id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            STATUS_COLORS[post.status]
                          }`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {post.status}
                        </span>
                        <span className="text-xs text-muted-foreground">{post.postType}</span>
                        {post.topic && (
                          <span className="text-xs text-muted-foreground">• {post.topic}</span>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2">{post.content}</p>
                      {post.imageUrls.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          🖼️ {post.imageUrls.length} image(s)
                        </div>
                      )}
                      {post.videoUrl && (
                        <div className="text-xs text-muted-foreground">🎥 Video attached</div>
                      )}
                      {post.scheduledAt && (
                        <div className="text-xs text-muted-foreground">
                          📅 Scheduled: {format(new Date(post.scheduledAt), 'PPpp')}
                        </div>
                      )}
                      {post.error && (
                        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                          ❌ {post.error}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {post.status === 'DRAFT' && (
                        <Button size="sm" variant="outline" onClick={() => handleSchedule(post._id)}>
                          <Calendar className="h-4 w-4" />
                        </Button>
                      )}
                      {post.status === 'SCHEDULED' && (
                        <Button size="sm" variant="outline" onClick={() => handleCancel(post._id)}>
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(post._id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
