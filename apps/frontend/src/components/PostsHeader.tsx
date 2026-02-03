import { useState } from "react";
import { Calendar } from "lucide-react";
import { Button } from "./ui/button";
import { SchedulerModal } from "./SchedulerModal";
import { type ScheduleConfig } from "@/types";

interface PostsHeaderProps {
  selectedCount: number;
  onSelectAll: (selected: boolean) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkSchedule: (ids: string[], config: ScheduleConfig) => void;
  onBulkScheduleRandom?: () => void; // New: for random distribution scheduling
  onBulkCancel?: (ids: string[]) => void; // New: for bulk canceling scheduled posts
  onBulkEditStatus?: () => void; // New: for bulk editing post status
  selectedIds: string[];
}

export const PostsHeader = ({
  selectedCount,
  onSelectAll,
  onBulkDelete,
  onBulkSchedule,
  onBulkScheduleRandom,
  onBulkCancel,
  onBulkEditStatus,
  selectedIds,
}: PostsHeaderProps) => {
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);

  const handleSchedulerSubmit = (config: ScheduleConfig) => {
    onBulkSchedule(selectedIds, config);
    setShowSchedulerModal(false);
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selectedCount > 0}
            onChange={(e) => onSelectAll(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium">
            {selectedCount > 0 ? `${selectedCount} selected` : "Select posts"}
          </span>
        </div>

        {selectedCount > 0 && (
          <div className="flex gap-2">
            {onBulkScheduleRandom && (
              <Button
                size="sm"
                variant="default"
                onClick={onBulkScheduleRandom}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Bulk Schedule ({selectedCount})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSchedulerModal(true)}
            >
              Schedule (Same Time)
            </Button>
            {onBulkCancel && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (
                    confirm(`Cancel schedule for ${selectedCount} post(s)?`)
                  ) {
                    onBulkCancel(selectedIds);
                  }
                }}
              >
                Cancel Schedule
              </Button>
            )}
            {onBulkEditStatus && (
              <Button size="sm" variant="outline" onClick={onBulkEditStatus}>
                Edit Status
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete ${selectedCount} post(s)?`)) {
                  onBulkDelete(selectedIds);
                }
              }}
            >
              Delete {selectedCount}
            </Button>
          </div>
        )}
      </div>

      <SchedulerModal
        isOpen={showSchedulerModal}
        onClose={() => setShowSchedulerModal(false)}
        onSchedule={handleSchedulerSubmit}
      />
    </div>
  );
};
