"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { X, Trash2 } from "lucide-react";

export type EventCategory =
  | "college"
  | "work"
  | "personal"
  | "exam"
  | "meeting"
  | "deadline"
  | "other";

export type EventData = {
  title: string;
  date: string;
  time: string;
  type: "event" | "task" | "deadline";
  category?: EventCategory;
  completed?: boolean;
  priority?: "low" | "medium" | "high";
  reminderMinutes?: number;
  repeat?:
    | "none"
    | "daily"
    | "weekdays"
    | "weekly"
    | "biweekly"
    | "monthly"
    | "yearly";
  allDay?: boolean;
};

type CalendarEvent = EventData & {
  id: string;
};

type Props = {
  open: boolean;
  event?: CalendarEvent | null;
  onClose: () => void;
  onSave: (data: EventData) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
};

const CATEGORIES: Array<{
  id: EventCategory;
  label: string;
  description: string;
  color: string;
}> = [
  {
    id: "college",
    label: "College",
    description: "Classes and academic work",
    color: "#2878d7",
  },
  {
    id: "work",
    label: "Work",
    description: "Professional plans",
    color: "#0b8f67",
  },
  {
    id: "personal",
    label: "Personal",
    description: "Personal plans",
    color: "#8147e8",
  },
  {
    id: "exam",
    label: "Exam",
    description: "Exams and tests",
    color: "#e56a00",
  },
  {
    id: "meeting",
    label: "Meeting",
    description: "Meetings and discussions",
    color: "#0da5c2",
  },
  {
    id: "deadline",
    label: "Deadline",
    description: "Important due dates",
    color: "#d92735",
  },
  {
    id: "other",
    label: "Other",
    description: "Everything else",
    color: "#8b95a5",
  },
];

export default function AddEventModal({
  open,
  event,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const isEditing = Boolean(event?.id);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");

  const [type, setType] =
    useState<EventData["type"]>("event");

  const [category, setCategory] =
    useState<EventCategory>("college");

  const [priority, setPriority] =
    useState<NonNullable<EventData["priority"]>>(
      "medium"
    );

  const [reminderMinutes, setReminderMinutes] =
    useState(0);

  const [repeat, setRepeat] =
    useState<NonNullable<EventData["repeat"]>>(
      "none"
    );

  const [allDay, setAllDay] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle(event?.title ?? "");
    setDate(event?.date ?? "");
    setTime(event?.time ?? "09:00");

    setType(
      event?.type ?? "event"
    );

    setCategory(
      event?.category ?? "college"
    );

    setPriority(
      event?.priority ?? "medium"
    );

    setReminderMinutes(
      event?.reminderMinutes ?? 0
    );

    setRepeat(
      event?.repeat ?? "none"
    );

    setAllDay(
      event?.allDay ?? false
    );
  }, [open, event]);

  if (!open) {
    return null;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle || !date) {
      return;
    }

    onSave({
      title: trimmedTitle,
      date,
      time: allDay
        ? "00:00"
        : time || "09:00",
      type,
      category,
      priority,
      reminderMinutes,
      repeat,
      allDay,
      completed: event?.completed ?? false,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        className="max-h-[95vh] w-full overflow-y-auto rounded-t-3xl border border-black/10 bg-[#faf8f3] shadow-2xl sm:max-w-[620px] sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-[#faf8f3]/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#711f2d]">
              {isEditing ? "Edit event" : "New event"}
            </p>

            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
              {isEditing
                ? event?.title || "Edit event"
                : "Add to DAYFRAME"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-black/35 transition hover:bg-black/5 hover:text-black"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 px-5 py-5 sm:px-6 sm:py-6"
        >
          <div>
            <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
              Title
            </label>

            <input
              autoFocus
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              placeholder="What do you have planned?"
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#711f2d]/40"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
                Date
              </label>

              <input
                type="date"
                value={date}
                onChange={(e) =>
                  setDate(e.target.value)
                }
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#711f2d]/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
                Time
              </label>

              <input
                type="time"
                value={time}
                disabled={allDay}
                onChange={(e) =>
                  setTime(e.target.value)
                }
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#711f2d]/40 disabled:opacity-40"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) =>
                setAllDay(e.target.checked)
              }
              className="h-4 w-4 accent-[#711f2d]"
            />

            <div>
              <p className="text-xs font-semibold">
                All-day event
              </p>

              <p className="mt-0.5 text-[10px] text-black/35">
                This event will appear in the all-day section.
              </p>
            </div>
          </label>

          <div>
            <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
              Type
            </label>

            <div className="grid grid-cols-3 gap-2">
              {[
                ["event", "Event"],
                ["task", "Task"],
                ["deadline", "Deadline"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  onClick={() =>
                    setType(
                      id as EventData["type"]
                    )
                  }
                  className={`rounded-xl border px-3 py-3 text-[10px] font-bold uppercase tracking-wider ${
                    type === id
                      ? "border-[#711f2d] bg-[#711f2d] text-white"
                      : "border-black/10 bg-white text-black/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
              Category
            </label>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORIES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() =>
                    setCategory(item.id)
                  }
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left ${
                    category === item.id
                      ? "border-black/20 bg-white"
                      : "border-black/5 bg-transparent"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        item.color,
                    }}
                  />

                  <span className="truncate text-[9px] font-bold uppercase tracking-wider text-black/45">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {type === "task" && (
            <div>
              <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
                Priority
              </label>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ["low", "Low"],
                  ["medium", "Medium"],
                  ["high", "High"],
                ].map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() =>
                      setPriority(
                        id as NonNullable<
                          EventData["priority"]
                        >
                      )
                    }
                    className={`rounded-xl border px-3 py-2.5 text-[9px] font-bold uppercase tracking-wider ${
                      priority === id
                        ? "border-[#711f2d] bg-[#711f2d] text-white"
                        : "border-black/10 bg-white text-black/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === "task" && (
            <div>
              <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
                Reminder
              </label>

              <select
                value={reminderMinutes}
                onChange={(e) =>
                  setReminderMinutes(
                    Number(e.target.value)
                  )
                }
                className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-[#711f2d]/40"
              >
                <option value={0}>
                  No reminder
                </option>
                <option value={5}>
                  5 minutes before
                </option>
                <option value={10}>
                  10 minutes before
                </option>
                <option value={15}>
                  15 minutes before
                </option>
                <option value={30}>
                  30 minutes before
                </option>
                <option value={60}>
                  1 hour before
                </option>
                <option value={1440}>
                  1 day before
                </option>
                <option value={10080}>
                  1 week before
                </option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-2 block text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
              Repeat
            </label>

            <select
              value={repeat}
              onChange={(e) =>
                setRepeat(
                  e.target.value as NonNullable<
                    EventData["repeat"]
                  >
                )
              }
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-xs outline-none focus:border-[#711f2d]/40"
            >
              <option value="none">
                Does not repeat
              </option>
              <option value="daily">
                Every day
              </option>
              <option value="weekdays">
                Every weekday
              </option>
              <option value="weekly">
                Every week
              </option>
              <option value="biweekly">
                Every 2 weeks
              </option>
              <option value="monthly">
                Every month
              </option>
              <option value="yearly">
                Every year
              </option>
            </select>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-black/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isEditing && onDelete && (
                <button
                  type="button"
                  onClick={() =>
                    void onDelete()
                  }
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[9px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-black/10 bg-white px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-black/45 sm:flex-none"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#711f2d] px-6 py-3 text-[9px] font-bold uppercase tracking-wider text-white transition hover:bg-[#5f1926] sm:flex-none"
              >
                {isEditing
                  ? "Save changes"
                  : "Add event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}