import React, { useState } from "react";
import { X, Calendar, Clock, Shuffle } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface BulkSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (
    startTime: string,
    endTime: string,
    options: { randomizeOrder: boolean }
  ) => void;
  postCount: number;
}

export const BulkSchedulerModal: React.FC<BulkSchedulerModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  postCount,
}) => {
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("20:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("22:00");
  const [randomizeOrder, setRandomizeOrder] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    if (!startDate || !endDate) {
      alert("Please select both start and end dates");
      return;
    }

    // Combine date and time into ISO strings
    const startDateTime = new Date(`${startDate}T${startTime}`).toISOString();
    const endDateTime = new Date(`${endDate}T${endTime}`).toISOString();

    // Validate time range
    if (new Date(startDateTime) >= new Date(endDateTime)) {
      alert("End time must be after start time");
      return;
    }

    // Validate minimum duration (5 minutes per post)
    const durationMs =
      new Date(endDateTime).getTime() - new Date(startDateTime).getTime();
    const minRequiredMs = postCount * 5 * 60 * 1000; // 5 minutes per post

    if (durationMs < minRequiredMs) {
      const minMinutes = Math.ceil(minRequiredMs / 60000);
      alert(
        `Time range too short! You need at least ${minMinutes} minutes for ${postCount} posts (5 min minimum gap between posts).`
      );
      return;
    }

    onSchedule(startDateTime, endDateTime, { randomizeOrder });
  };

  if (!isOpen) return null;

  // Calculate estimated duration
  const getEstimatedDuration = () => {
    if (!startDate || !endDate) return null;
    try {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      const diffMs = end.getTime() - start.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMin / 60);
      const minutes = diffMin % 60;
      return { hours, minutes, totalMinutes: diffMin };
    } catch {
      return null;
    }
  };

  const duration = getEstimatedDuration();
  const minRequired = postCount * 5; // 5 minutes per post

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Calendar className="h-6 w-6" />
                Bulk Schedule Posts
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Schedule {postCount} post{postCount !== 1 ? "s" : ""} with
                random time distribution
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                How it works:
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>
                  • Posts will be scheduled randomly within your selected time
                  range
                </li>
                <li>
                  • Minimum 5-minute gap between each post for natural behavior
                </li>
                <li>• All posts will publish before or at the end time</li>
                <li>• Each post gets a unique timestamp (no duplicates)</li>
              </ul>
            </div>

            {/* Start Time */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Start Time
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  />
                </div>
              </div>
            </div>

            {/* End Time */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                End Time
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Duration Display */}
            {duration && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total Duration:</span>
                  <span className="text-lg font-bold">
                    {duration.hours}h {duration.minutes}m
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-muted-foreground">
                    Required minimum:
                  </span>
                  <span className="text-sm">
                    {Math.floor(minRequired / 60)}h {minRequired % 60}m
                  </span>
                </div>
                {duration.totalMinutes < minRequired && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Time range is too short! Need at least {minRequired}{" "}
                    minutes.
                  </p>
                )}
                {duration.totalMinutes >= minRequired && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    ✓ Sufficient time for all posts
                  </p>
                )}
              </div>
            )}

            {/* Options */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Options</h3>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={randomizeOrder}
                  onChange={(e) => setRandomizeOrder(e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="flex items-center gap-2">
                  <Shuffle className="h-4 w-4" />
                  <span className="text-sm">Randomize post order</span>
                </div>
              </label>
              <p className="text-xs text-muted-foreground ml-7">
                Shuffles which posts are published at which times for more
                natural behavior
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={!duration || duration.totalMinutes < minRequired}
              >
                Schedule {postCount} Post{postCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
};
