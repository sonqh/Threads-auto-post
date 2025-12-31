import React, { useState } from "react";
import {
  X,
  Calendar,
  Clock,
  Repeat2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { ScheduleConfig } from "@/types";

interface SchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (config: ScheduleConfig) => void;
}

const DatePicker: React.FC<{
  value: string;
  onChange: (date: string) => void;
  label?: string;
}> = ({ value, onChange, label = "Select Date" }) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(
    value ? new Date(value) : new Date()
  );

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handleDateClick = (day: number) => {
    const newDate = new Date(displayMonth);
    newDate.setDate(day);
    const dateStr = newDate.toISOString().split("T")[0];
    onChange(dateStr);
    setShowCalendar(false);
  };

  const previousMonth = () => {
    setDisplayMonth(
      new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setDisplayMonth(
      new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1)
    );
  };

  const days = [];
  const blanks = firstDayOfMonth(displayMonth);
  for (let i = 0; i < blanks; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth(displayMonth); i++) {
    days.push(i);
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const selectedDate = value ? new Date(value) : null;
  const isSelectedMonth =
    selectedDate &&
    selectedDate.getMonth() === displayMonth.getMonth() &&
    selectedDate.getFullYear() === displayMonth.getFullYear();

  return (
    <div className="relative">
      <button
        onClick={() => setShowCalendar(!showCalendar)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left text-sm font-medium flex items-center justify-between hover:border-gray-400 transition"
      >
        <span>
          {value
            ? new Date(value).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : label}
        </span>
        <Calendar size={16} className="text-gray-400" />
      </button>

      {showCalendar && (
        <div className="absolute top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50 w-full">
          {/* Month/Year Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={previousMonth}
              className="p-1 hover:bg-gray-100 rounded transition"
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className="font-semibold text-center flex-1">
              {monthNames[displayMonth.getMonth()]} {displayMonth.getFullYear()}
            </h3>
            <button
              onClick={nextMonth}
              className="p-1 hover:bg-gray-100 rounded transition"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-semibold text-gray-500 py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => (
              <button
                key={idx}
                onClick={() => day && handleDateClick(day)}
                disabled={!day}
                className={`aspect-square text-xs font-medium rounded transition ${
                  !day
                    ? "text-transparent cursor-default"
                    : isSelectedMonth && selectedDate?.getDate() === day
                    ? "bg-blue-500 text-white font-bold"
                    : new Date(
                        displayMonth.getFullYear(),
                        displayMonth.getMonth(),
                        day
                      ) < new Date()
                    ? "text-gray-300 cursor-not-allowed"
                    : "hover:bg-blue-100 text-gray-700"
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          {/* Today Button */}
          <button
            onClick={() => {
              const today = new Date().toISOString().split("T")[0];
              onChange(today);
              setShowCalendar(false);
            }}
            className="w-full mt-3 text-xs font-medium text-blue-500 hover:text-blue-700 py-1"
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
};

const TimePicker: React.FC<{
  value: string;
  onChange: (time: string) => void;
}> = ({ value, onChange }) => {
  const [showPicker, setShowPicker] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0")
  );
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0")
  );

  const [hour, minute] =
    value.split(":").length === 2 ? value.split(":") : ["09", "00"];

  const handleTimeChange = (h: string, m: string) => {
    onChange(`${h}:${m}`);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left text-sm font-medium flex items-center justify-between hover:border-gray-400 transition"
      >
        <span>{value}</span>
        <Clock size={16} className="text-gray-400" />
      </button>

      {showPicker && (
        <div className="absolute top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50 w-full">
          <div className="text-xs font-semibold text-gray-600 mb-2">
            Select Time
          </div>
          <div className="flex items-center gap-2">
            {/* Hours */}
            <div className="flex-1">
              <div className="text-xs text-gray-500 text-center mb-1">Hour</div>
              <select
                value={hour}
                onChange={(e) => handleTimeChange(e.target.value, minute)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-medium"
              >
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {/* Separator */}
            <div className="text-lg font-bold text-gray-400">:</div>

            {/* Minutes */}
            <div className="flex-1">
              <div className="text-xs text-gray-500 text-center mb-1">Min</div>
              <select
                value={minute}
                onChange={(e) => handleTimeChange(hour, e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-medium"
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Select Buttons */}
          <div className="grid grid-cols-3 gap-1 mt-3">
            {["09:00", "12:00", "14:00", "16:00", "18:00", "20:00"].map(
              (time) => (
                <button
                  key={time}
                  onClick={() => {
                    const [h, m] = time.split(":");
                    handleTimeChange(h, m);
                    setShowPicker(false);
                  }}
                  className={`text-xs font-medium py-1 px-2 rounded transition ${
                    value === time
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {time}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (config: ScheduleConfig) => void;
  selectedAccount?: {
    id: string;
    accountName: string;
    threadsUserId: string;
    isDefault?: boolean;
  };
}

export const SchedulerModal: React.FC<SchedulerModalProps> = ({
  isOpen,
  onClose,
  onSchedule,
  selectedAccount,
}) => {
  const [pattern, setPattern] = useState<ScheduleConfig["pattern"]>("ONCE");
  const [scheduledAt, setScheduledAt] = useState("");
  const [time, setTime] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]); // Default: Monday
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string>("");

  if (!isOpen) return null;

  const handleSchedule = () => {
    setError("");

    // Validation
    if (!scheduledAt) {
      setError("Please select a start date");
      return;
    }

    if (pattern === "DATE_RANGE" && !endDate) {
      setError("Please select an end date for date range scheduling");
      return;
    }

    if (pattern === "WEEKLY" && daysOfWeek.length === 0) {
      setError("Please select at least one day of the week");
      return;
    }

    // Combine date and time into proper local datetime, then convert to UTC
    const [hours, minutes, seconds] = time.split(":").map(Number);
    const [year, month, day] = scheduledAt.split("-").map(Number);

    // Create date object in user's LOCAL timezone
    const localDate = new Date(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds || 0,
      0
    );

    // Convert to UTC ISO string (this is what we want!)
    // When user selects 7:18 PM PST, this becomes 2:18 AM UTC next day
    const isoDateTime = localDate.toISOString();

    console.log("📅 Schedule Debug:");
    console.log(`   Selected date: ${scheduledAt}`);
    console.log(`   Selected time: ${time} (your local time)`);
    console.log(`   Local Date object: ${localDate.toString()}`);
    console.log(`   UTC ISO (what we store): ${isoDateTime}`);
    console.log(`   This will publish at ${time} in your timezone`);

    const config: ScheduleConfig = {
      pattern,
      scheduledAt: isoDateTime,
      time,
    };

    if (pattern === "WEEKLY") {
      config.daysOfWeek = daysOfWeek;
    } else if (pattern === "MONTHLY") {
      config.dayOfMonth = dayOfMonth;
    } else if (pattern === "DATE_RANGE") {
      // Parse endDate with proper timezone conversion
      if (endDate) {
        const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
        const endDateLocal = new Date(
          endYear,
          endMonth - 1,
          endDay,
          23,
          59,
          59,
          999
        );
        config.endDate = endDateLocal.toISOString();
      }
    }

    console.log("📤 Sending config to API:", config);
    onSchedule(config);
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Schedule Post</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Selected Account Indicator */}
        {selectedAccount && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs font-medium text-blue-900 mb-1">
              📱 Posting to account:
            </p>
            <p className="text-sm font-semibold text-blue-700">
              {selectedAccount.accountName}
              {selectedAccount.isDefault && " (Default)"}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <span className="text-red-500 font-bold text-lg">⚠️</span>
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Pattern Selection */}
          <div>
            <label className="block text-sm font-medium mb-3">
              <Repeat2 size={16} className="inline mr-2" />
              <span className="font-semibold">Schedule Type</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "ONCE", label: "Once", desc: "Single publish" },
                { id: "WEEKLY", label: "Weekly", desc: "Recurring days" },
                { id: "MONTHLY", label: "Monthly", desc: "Monthly recur" },
                { id: "DATE_RANGE", label: "Date Range", desc: "Daily window" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() =>
                    setPattern(opt.id as ScheduleConfig["pattern"])
                  }
                  className={`px-3 py-3 rounded-lg text-sm font-medium transition transform ${
                    pattern === opt.id
                      ? "bg-blue-500 text-white shadow-lg scale-105 border border-blue-600"
                      : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 hover:border-gray-400"
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div
                    className={`text-xs ${
                      pattern === opt.id ? "text-blue-100" : "text-gray-500"
                    }`}
                  >
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Calendar size={16} className="inline mr-2" />
              Start Date
            </label>
            <DatePicker
              value={scheduledAt}
              onChange={setScheduledAt}
              label="Choose date"
            />
          </div>

          {/* Time Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Clock size={16} className="inline mr-2" />
              Time
            </label>
            <TimePicker value={time} onChange={setTime} />
          </div>

          {/* Weekly Pattern */}
          {pattern === "WEEKLY" && (
            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <label className="block text-sm font-semibold text-blue-900 mb-3">
                📅 Select Days of Week
              </label>
              <div className="grid grid-cols-7 gap-2">
                {dayNames.map((day, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setDaysOfWeek((prev) =>
                        prev.includes(idx)
                          ? prev.filter((d) => d !== idx)
                          : [...prev, idx]
                      );
                    }}
                    className={`py-2 rounded font-semibold text-sm transition ${
                      daysOfWeek.includes(idx)
                        ? "bg-blue-500 text-white shadow-md scale-105"
                        : "bg-white border border-blue-300 text-gray-700 hover:bg-blue-100"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {daysOfWeek.length > 0 && (
                <p className="text-xs text-blue-700 mt-2">
                  ✓ Posts on {daysOfWeek.map((idx) => dayNames[idx]).join(", ")}{" "}
                  at {time}
                </p>
              )}
            </div>
          )}

          {/* Monthly Pattern */}
          {pattern === "MONTHLY" && (
            <div className="p-3 bg-green-50 rounded-md border border-green-200">
              <label className="block text-sm font-semibold text-green-900 mb-3">
                📅 Select Day of Month
              </label>
              <select
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-full px-3 py-2 border border-green-300 rounded-md bg-white font-medium text-gray-700 hover:border-green-400 transition"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                    {day === 1
                      ? "st"
                      : day === 2
                      ? "nd"
                      : day === 3
                      ? "rd"
                      : "th"}{" "}
                    of every month
                  </option>
                ))}
              </select>
              <p className="text-xs text-green-700 mt-2">
                ✓ Posts on the {dayOfMonth}
                {dayOfMonth === 1
                  ? "st"
                  : dayOfMonth === 2
                  ? "nd"
                  : dayOfMonth === 3
                  ? "rd"
                  : "th"}{" "}
                of every month at {time}
              </p>
            </div>
          )}

          {/* Date Range Pattern */}
          {pattern === "DATE_RANGE" && (
            <div className="space-y-3 p-3 bg-blue-50 rounded-md border border-blue-200">
              <p className="text-xs font-medium text-blue-900">
                📅 Post will publish daily at {time} between the dates below
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  End Date
                </label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  label="Choose end date"
                />
              </div>
            </div>
          )}

          {/* Schedule Summary */}
          <div className="p-3 bg-gray-50 rounded-md border border-gray-200 mb-2">
            <p className="text-xs font-semibold text-gray-700 mb-2">
              📋 Schedule Summary:
            </p>
            <div className="space-y-1 text-xs text-gray-600">
              <p>
                <span className="font-medium">Type:</span>{" "}
                {pattern === "ONCE"
                  ? "One-time"
                  : pattern === "WEEKLY"
                  ? "Weekly on " +
                    daysOfWeek.map((idx) => dayNames[idx]).join(", ")
                  : pattern === "MONTHLY"
                  ? `Monthly on the ${dayOfMonth}${
                      dayOfMonth === 1
                        ? "st"
                        : dayOfMonth === 2
                        ? "nd"
                        : dayOfMonth === 3
                        ? "rd"
                        : "th"
                    }`
                  : "Daily from date range"}
              </p>
              <p>
                <span className="font-medium">Date:</span>{" "}
                {scheduledAt
                  ? new Date(scheduledAt).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "Not selected"}
              </p>
              {endDate && (
                <p>
                  <span className="font-medium">Until:</span>{" "}
                  {new Date(endDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
              <p>
                <span className="font-medium">Time:</span> {time}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button onClick={onClose} variant="outline" className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              className="flex-1 bg-blue-500 hover:bg-blue-600"
            >
              Schedule
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
