"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  getDaysInMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  Search,
  X,
} from "lucide-react";

import AddEventModal, {
  EventData,
} from "@/components/AddEventModal";

import { supabase } from "@/lib/supabase";

/* =========================================================
   TYPES
========================================================= */

type EventCategory =
  | "college"
  | "work"
  | "personal"
  | "exam"
  | "meeting"
  | "deadline"
  | "other";

type CalendarEvent = {
  id: string;
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

type ViewMode = "month" | "week" | "day";

type DayframeNotification = {
  id: string;
  eventId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  kind: "reminder" | "overdue";
};

type DbEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  type: string;
  category: string;
  priority: string;
  reminder_minutes: number | null;
  repeat: string;
  all_day: boolean;
  completed: boolean;
  created_at?: string;
  user_id: string;
};

/* =========================================================
   CATEGORY META
========================================================= */

const CATEGORY_META: Record<
  EventCategory,
  {
    label: string;
    dot: string;
  }
> = {
  college: {
    label: "College",
    dot: "#2878d7",
  },
  work: {
    label: "Work",
    dot: "#0b8f67",
  },
  personal: {
    label: "Personal",
    dot: "#7c45d9",
  },
  exam: {
    label: "Exam",
    dot: "#d75a00",
  },
  meeting: {
    label: "Meeting",
    dot: "#079fbc",
  },
  deadline: {
    label: "Deadline",
    dot: "#ba1e2d",
  },
  other: {
    label: "Other",
    dot: "#7b8490",
  },
};

const REPEAT_LABELS: Record<string, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year",
};

/* =========================================================
   HELPERS
========================================================= */

function getDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function formatTime(time: string) {
  if (!time) return "";

  const [hours, minutes] = time
    .split(":")
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return time;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${String(minutes).padStart(
    2,
    "0"
  )} ${suffix}`;
}

function getHour(time: string) {
  const value = Number(
    time?.split(":")[0] ?? 0
  );

  return Number.isNaN(value) ? 0 : value;
}

function getMinute(time: string) {
  const value = Number(
    time?.split(":")[1] ?? 0
  );

  return Number.isNaN(value) ? 0 : value;
}

function getMinutesFromTime(time: string) {
  return (
    getHour(time) * 60 +
    getMinute(time)
  );
}

function normalizeEvent(
  event: CalendarEvent
): CalendarEvent {
  return {
    ...event,
    category:
      event.category ??
      (event.type === "deadline"
        ? "deadline"
        : event.type === "task"
        ? "college"
        : "other"),
    completed:
      event.completed ?? false,
    priority:
      event.priority ?? "medium",
    reminderMinutes:
      event.reminderMinutes ?? 0,
    repeat:
      event.repeat ?? "none",
    allDay:
      event.allDay ?? false,
  };
}

function createEmptyEvent(
  date: string,
  time = "09:00"
): CalendarEvent {
  return {
    id: "",
    title: "",
    date,
    time,
    type: "event",
    category: "college",
    completed: false,
    priority: "medium",
    reminderMinutes: 0,
    repeat: "none",
    allDay: false,
  };
}

/* =========================================================
   RECURRING EVENTS
========================================================= */

function getRecurringOccurrences(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const repeat =
    event.repeat ?? "none";

  const originalDate =
    parseISO(event.date);

  if (repeat === "none") {
    if (
      originalDate >= rangeStart &&
      originalDate <= rangeEnd
    ) {
      return [event];
    }

    return [];
  }

  if (
    originalDate > rangeEnd
  ) {
    return [];
  }

  const result: CalendarEvent[] = [];

  let cursor =
    new Date(originalDate);

  let safety = 0;

  while (
    cursor <= rangeEnd &&
    safety < 1000
  ) {
    safety++;

    let include = true;

    if (
      repeat === "weekdays"
    ) {
      const day =
        cursor.getDay();

      include =
        day !== 0 &&
        day !== 6;
    }

    if (
      cursor >= rangeStart &&
      include
    ) {
      result.push({
        ...event,
        id: `${event.id}-${getDateKey(
          cursor
        )}`,
        date: getDateKey(cursor),
      });
    }

    switch (repeat) {
      case "daily":
      case "weekdays":
        cursor = addDays(
          cursor,
          1
        );
        break;

      case "weekly":
        cursor = addWeeks(
          cursor,
          1
        );
        break;

      case "biweekly":
        cursor = addWeeks(
          cursor,
          2
        );
        break;

      case "monthly":
        cursor = addMonths(
          cursor,
          1
        );
        break;

      case "yearly":
        cursor = addYears(
          cursor,
          1
        );
        break;

      default:
        return result;
    }
  }

  return result;
}

/* =========================================================
   DB CONVERSION
========================================================= */

function dbRowToEvent(
  row: DbEvent
): CalendarEvent {
  return normalizeEvent({
    id: String(row.id),
    title: row.title,
    date: String(row.date),
    time:
      String(row.time ?? "00:00")
        .slice(0, 5),
    type:
      row.type === "task" ||
      row.type === "deadline"
        ? row.type
        : "event",
    category:
      (row.category as EventCategory) ??
      "other",
    priority:
      row.priority === "low" ||
      row.priority === "high"
        ? row.priority
        : "medium",
    reminderMinutes:
      row.reminder_minutes ??
      0,
    repeat:
      (row.repeat as CalendarEvent["repeat"]) ??
      "none",
    allDay:
      Boolean(row.all_day),
    completed:
      Boolean(row.completed),
  });
}

function eventToDbRow(
  event: CalendarEvent,
  userId: string
) {
  return {
    id:
      getBaseEventId(event),
    title:
      event.title.trim(),
    date:
      event.date,
    time:
      event.allDay
        ? "00:00:00"
        : `${event.time}:00`,
    type:
      event.type,
    category:
      event.category ??
      "other",
    priority:
      event.priority ??
      "medium",
    reminder_minutes:
      event.reminderMinutes ??
      0,
    repeat:
      event.repeat ??
      "none",
    all_day:
      Boolean(event.allDay),
    completed:
      Boolean(event.completed),
    user_id:
      userId,
  };
}

/* =========================================================
   IMPORTANT:
   Handles normal IDs and recurring occurrence IDs.
========================================================= */

function getBaseEventId(
  eventOrId:
    | string
    | CalendarEvent
) {
  const eventId =
    typeof eventOrId ===
    "string"
      ? eventOrId
      : eventOrId?.id;

  if (
    typeof eventId !==
      "string" ||
    !eventId
  ) {
    return "";
  }

  const match =
    eventId.match(
      /^(.+)-\d{4}-\d{2}-\d{2}$/
    );

  return match
    ? match[1]
    : eventId;
}

/* =========================================================
   MAIN PAGE
========================================================= */

export default function Home() {
  const router =
    useRouter();

  /* -------------------------
     Calendar state
  ------------------------- */

  const [
    month,
    setMonth,
  ] = useState(0);

  const [
    year,
    setYear,
  ] = useState(2026);

  const [
    selectedDay,
    setSelectedDay,
  ] = useState(1);

  const [
    weekStart,
    setWeekStart,
  ] =
    useState<Date | null>(
      null
    );

  const [
    todayDate,
    setTodayDate,
  ] =
    useState<Date | null>(
      null
    );

  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    viewMode,
    setViewMode,
  ] =
    useState<ViewMode>(
      "month"
    );

  /* -------------------------
     Auth
  ------------------------- */

  const [
    userId,
    setUserId,
  ] = useState("");

  const [
    userEmail,
    setUserEmail,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    supabaseError,
    setSupabaseError,
  ] =
    useState<string | null>(
      null
    );

  /* -------------------------
     Events
  ------------------------- */

  const [
    events,
    setEvents,
  ] =
    useState<CalendarEvent[]>(
      []
    );

  const [
    editingEvent,
    setEditingEvent,
  ] =
    useState<CalendarEvent | null>(
      null
    );

  const [
    showModal,
    setShowModal,
  ] =
    useState(false);

  /* -------------------------
     Search/filter
  ------------------------- */

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] =
    useState<
      EventCategory | "all"
    >("all");

  /* -------------------------
     Notifications
  ------------------------- */

  const [
    notifications,
    setNotifications,
  ] =
    useState<
      DayframeNotification[]
    >([]);

  const [
    showNotifications,
    setShowNotifications,
  ] =
    useState(false);

  const [
    notificationPermission,
    setNotificationPermission,
  ] =
    useState<
      NotificationPermission
    >("default");

  /* -------------------------
     UI alert
  ------------------------- */

  const [
    showAlert,
    setShowAlert,
  ] =
    useState(false);

  const [
    alertMessage,
    setAlertMessage,
  ] =
    useState("");

  /* -------------------------
     Drag/drop
  ------------------------- */

  const [
    draggedEvent,
    setDraggedEvent,
  ] =
    useState<CalendarEvent | null>(
      null
    );

  const dragJustEndedRef =
    useRef(false);

  /* -------------------------
     Refs
  ------------------------- */

  const notificationPanelRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const notifiedReminders =
    useRef(
      new Set<string>()
    );

  const notifiedOverdue =
    useRef(
      new Set<string>()
    );

  /* =========================================================
     INITIAL CLIENT SETUP
  ========================================================= */

  useEffect(() => {
    const now =
      new Date();

    setTodayDate(
      now
    );

    setMonth(
      now.getMonth()
    );

    setYear(
      now.getFullYear()
    );

    setSelectedDay(
      now.getDate()
    );

    setWeekStart(
      startOfWeek(
        now,
        {
          weekStartsOn: 0,
        }
      )
    );

    setMounted(
      true
    );

    if (
      typeof window !==
      "undefined" &&
      "Notification" in
        window
    ) {
      setNotificationPermission(
        Notification.permission
      );
    }
  }, []);

  /* =========================================================
     AUTH + LOAD EVENTS
  ========================================================= */

  useEffect(() => {
    if (!mounted) {
      return;
    }

    let active = true;

    async function loadSession() {
      setLoading(
        true
      );

      const {
        data,
        error,
      } =
        await supabase.auth.getSession();

      if (
        error ||
        !data.session
      ) {
        if (active) {
          router.replace(
            "/auth"
          );
        }

        return;
      }

      if (!active) {
        return;
      }

      const session =
        data.session;

      setUserId(
        session.user.id
      );

      setUserEmail(
        session.user.email ??
        ""
      );

      const {
        data: rows,
        error:
          eventsError,
      } =
        await supabase
          .from("events")
          .select("*")
          .eq(
            "user_id",
            session.user.id
          )
          .order(
            "date",
            {
              ascending:
                true,
            }
          )
          .order(
            "time",
            {
              ascending:
                true,
            }
          );

      if (
        eventsError
      ) {
        console.error(
          "DAYFRAME load events error:",
          eventsError
        );

        setSupabaseError(
          eventsError.message
        );
      } else {
        setEvents(
          (
            rows as DbEvent[]
          ).map(
            dbRowToEvent
          )
        );
      }

      setLoading(
        false
      );
    }

    void loadSession();

    const {
      data:
        authListener,
    } =
      supabase.auth.onAuthStateChange(
        (
          authEvent
        ) => {
          if (
            authEvent ===
            "SIGNED_OUT"
          ) {
            setEvents(
              []
            );

            setUserId(
              ""
            );

            setUserEmail(
              ""
            );

            router.replace(
              "/auth"
            );
          }
        }
      );

    return () => {
      active =
        false;

      authListener.subscription.unsubscribe();
    };
  }, [
    mounted,
    router,
  ]);

  /* =========================================================
     LOCAL NOTIFICATIONS
  ========================================================= */

  useEffect(() => {
    if (!mounted) {
      return;
    }

    try {
      const stored =
        localStorage.getItem(
          "dayframe-notifications"
        );

      if (stored) {
        setNotifications(
          JSON.parse(
            stored
          )
        );
      }
    } catch {
      setNotifications(
        []
      );
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    localStorage.setItem(
      "dayframe-notifications",
      JSON.stringify(
        notifications
      )
    );
  }, [
    notifications,
    mounted,
  ]);

  /* =========================================================
     REALTIME

     DO NOT MODIFY THIS BLOCK.
  ========================================================= */

  useEffect(() => {
    if (
      !mounted ||
      !userId
    ) {
      return;
    }

    console.log(
      "DAYFRAME: starting realtime for user",
      userId
    );

    const channel =
      supabase
        .channel(
          `dayframe-events-${userId}`
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "events",
          },
          (payload) => {
            console.log(
              "DAYFRAME realtime INSERT:",
              payload.new
            );

            if (
              String(
                payload.new.user_id
              ) !== userId
            ) {
              console.log(
                "DAYFRAME realtime INSERT ignored: different user"
              );

              return;
            }

            const incoming =
              dbRowToEvent(
                payload.new as DbEvent
              );

            setEvents(
              (current) => {
                const existingIndex =
                  current.findIndex(
                    (event) =>
                      event.id ===
                      incoming.id
                  );

                if (
                  existingIndex !==
                  -1
                ) {
                  const updated =
                    [
                      ...current,
                    ];

                  updated[
                    existingIndex
                  ] =
                    incoming;

                  return updated;
                }

                return [
                  ...current,
                  incoming,
                ];
              }
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "events",
          },
          (payload) => {
            console.log(
              "DAYFRAME realtime UPDATE:",
              payload.new
            );

            if (
              String(
                payload.new.user_id
              ) !== userId
            ) {
              return;
            }

            const incoming =
              dbRowToEvent(
                payload.new as DbEvent
              );

            setEvents(
              (current) =>
                current.map(
                  (event) =>
                    event.id ===
                    incoming.id
                      ? incoming
                      : event
                )
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "events",
          },
          (payload) => {
            console.log(
              "DAYFRAME realtime DELETE:",
              payload.old
            );

            if (
              String(
                payload.old.user_id
              ) !== userId
            ) {
              return;
            }

            const deletedId =
              String(
                payload.old.id
              );

            setEvents(
              (current) =>
                current.filter(
                  (event) =>
                    getBaseEventId(
                      event
                    ) !==
                    deletedId
                )
            );
          }
        );

    channel.subscribe(
      (status) => {
        console.log(
          "DAYFRAME realtime status:",
          status
        );
      }
    );

    return () => {
      console.log(
        "DAYFRAME: removing realtime channel"
      );

      supabase.removeChannel(
        channel
      );
    };
  }, [
    mounted,
    userId,
  ]);

  /* =========================================================
     CURRENT DATES
  ========================================================= */

  const displayedMonthDate =
    useMemo(
      () =>
        new Date(
          year,
          month,
          1
        ),
      [
        month,
        year,
      ]
    );

  const selectedDate =
    useMemo(
      () =>
        new Date(
          year,
          month,
          selectedDay
        ),
      [
        year,
        month,
        selectedDay,
      ]
    );

  const selectedDateString =
    getDateKey(
      selectedDate
    );

  const weekDates =
    useMemo(() => {
      if (
        !weekStart
      ) {
        return [];
      }

      return Array.from(
        {
          length:
            7,
        },
        (
          _,
          index
        ) =>
          addDays(
            weekStart,
            index
          )
      );
    }, [
      weekStart,
    ]);

  /* =========================================================
     RANGE
  ========================================================= */

  const rangeStart =
    useMemo(() => {
      if (
        viewMode ===
        "day"
      ) {
        return selectedDate;
      }

      if (
        viewMode ===
          "week" &&
        weekStart
      ) {
        return weekStart;
      }

      return startOfMonth(
        displayedMonthDate
      );
    }, [
      viewMode,
      selectedDate,
      weekStart,
      displayedMonthDate,
    ]);

  const rangeEnd =
    useMemo(() => {
      if (
        viewMode ===
        "day"
      ) {
        return selectedDate;
      }

      if (
        viewMode ===
          "week" &&
        weekStart
      ) {
        return addDays(
          weekStart,
          6
        );
      }

      return addDays(
        addMonths(
          startOfMonth(
            displayedMonthDate
          ),
          1
        ),
        -1
      );
    }, [
      viewMode,
      selectedDate,
      weekStart,
      displayedMonthDate,
    ]);

  /* =========================================================
     VISIBLE EVENTS
  ========================================================= */

  const visibleEvents =
    useMemo(() => {
      let result =
        events.flatMap(
          (event) =>
            getRecurringOccurrences(
              event,
              rangeStart,
              rangeEnd
            )
        );

      const query =
        searchQuery
          .trim()
          .toLowerCase();

      if (query) {
        result =
          result.filter(
            (event) =>
              event.title
                .toLowerCase()
                .includes(
                  query
                )
          );
      }

      if (
        categoryFilter !==
        "all"
      ) {
        result =
          result.filter(
            (event) =>
              event.category ===
              categoryFilter
          );
      }

      return result.sort(
        (a, b) =>
          a.time.localeCompare(
            b.time
          )
      );
    }, [
      events,
      rangeStart,
      rangeEnd,
      searchQuery,
      categoryFilter,
    ]);

  const selectedDateEvents =
    useMemo(
      () =>
        visibleEvents.filter(
          (event) =>
            event.date ===
            selectedDateString
        ),
      [
        visibleEvents,
        selectedDateString,
      ]
    );

  const unreadCount =
    notifications.filter(
      (item) =>
        !item.read
    ).length;

  /* =========================================================
     CALENDAR DAYS
  ========================================================= */

  const calendarDays =
    useMemo(() => {
      const days =
        getDaysInMonth(
          displayedMonthDate
        );

      const first =
        startOfMonth(
          displayedMonthDate
        ).getDay();

      const result:
        Array<
          number | null
        > = [];

      for (
        let i = 0;
        i < first;
        i++
      ) {
        result.push(
          null
        );
      }

      for (
        let day = 1;
        day <= days;
        day++
      ) {
        result.push(
          day
        );
      }

      while (
        result.length %
          7 !==
        0
      ) {
        result.push(
          null
        );
      }

      return result;
    }, [
      displayedMonthDate,
    ]);

  /* =========================================================
     TODAY
  ========================================================= */

  function isToday(
    date: Date
  ) {
    if (
      !todayDate
    ) {
      return false;
    }

    return (
      date.getFullYear() ===
        todayDate.getFullYear() &&
      date.getMonth() ===
        todayDate.getMonth() &&
      date.getDate() ===
        todayDate.getDate()
    );
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function goToToday() {
    const now =
      new Date();

    setMonth(
      now.getMonth()
    );

    setYear(
      now.getFullYear()
    );

    setSelectedDay(
      now.getDate()
    );

    setWeekStart(
      startOfWeek(
        now,
        {
          weekStartsOn: 0,
        }
      )
    );
  }

  function previousMonth() {
    const next =
      subMonths(
        displayedMonthDate,
        1
      );

    setMonth(
      next.getMonth()
    );

    setYear(
      next.getFullYear()
    );

    setSelectedDay(
      1
    );
  }

  function nextMonth() {
    const next =
      addMonths(
        displayedMonthDate,
        1
      );

    setMonth(
      next.getMonth()
    );

    setYear(
      next.getFullYear()
    );

    setSelectedDay(
      1
    );
  }

  function previousWeek() {
    if (
      !weekStart
    ) {
      return;
    }

    const next =
      addDays(
        weekStart,
        -7
      );

    setWeekStart(
      next
    );

    setMonth(
      next.getMonth()
    );

    setYear(
      next.getFullYear()
    );

    setSelectedDay(
      next.getDate()
    );
  }

  function nextWeek() {
    if (
      !weekStart
    ) {
      return;
    }

    const next =
      addDays(
        weekStart,
        7
      );

    setWeekStart(
      next
    );

    setMonth(
      next.getMonth()
    );

    setYear(
      next.getFullYear()
    );

    setSelectedDay(
      next.getDate()
    );
  }

  function previousDay() {
    const next =
      addDays(
        selectedDate,
        -1
      );

    selectDate(
      next
    );
  }

  function nextDay() {
    const next =
      addDays(
        selectedDate,
        1
      );

    selectDate(
      next
    );
  }

  function selectDate(
    date: Date
  ) {
    setMonth(
      date.getMonth()
    );

    setYear(
      date.getFullYear()
    );

    setSelectedDay(
      date.getDate()
    );

    setWeekStart(
      startOfWeek(
        date,
        {
          weekStartsOn: 0,
        }
      )
    );
  }

  /* =========================================================
     MODAL
  ========================================================= */

  function openAddEvent(
    date: Date = selectedDate,
    time = "09:00"
  ) {
    const target =
      new Date(
        date
      );

    setEditingEvent(
      createEmptyEvent(
        getDateKey(
          target
        ),
        time
      )
    );

    selectDate(
      target
    );

    setShowModal(
      true
    );
  }

  function openEditEvent(
    event: CalendarEvent
  ) {
    const baseId =
      getBaseEventId(
        event
      );

    const original =
      events.find(
        (item) =>
          item.id ===
          baseId
      );

    setEditingEvent(
      original ??
        event
    );

    setShowModal(
      true
    );
  }

  function closeModal() {
    setShowModal(
      false
    );

    setEditingEvent(
      null
    );
  }

  /* =========================================================
     SAVE EVENT
  ========================================================= */

  async function saveEvent(
    data: EventData
  ) {
    if (!userId) {
      alert(
        "Your session is not ready. Please sign in again."
      );

      router.replace(
        "/auth"
      );

      return;
    }

    const editingId =
      editingEvent?.id
        ? getBaseEventId(
            editingEvent.id
          )
        : "";

    const id =
      editingId ||
      crypto.randomUUID();

    const event =
      normalizeEvent({
        ...(editingEvent ??
          createEmptyEvent(
            data.date,
            data.time
          )),
        ...data,
        id,
      });

    try {
      setSupabaseError(
        null
      );

      const dbRow =
        eventToDbRow(
          event,
          userId
        );

      let error =
        null;

      if (
        editingId
      ) {
        const result =
          await supabase
            .from(
              "events"
            )
            .update(
              dbRow
            )
            .eq(
              "id",
              editingId
            )
            .eq(
              "user_id",
              userId
            );

        error =
          result.error;
      } else {
        const result =
          await supabase
            .from(
              "events"
            )
            .insert(
              dbRow
            );

        error =
          result.error;
      }

      if (
        error
      ) {
        console.error(
          "DAYFRAME save error:",
          error
        );

        setSupabaseError(
          error.message
        );

        alert(
          `Could not save event.\n\n${error.message}`
        );

        return;
      }

      if (
        editingId
      ) {
        setEvents(
          (
            current
          ) =>
            current.map(
              (
                item
              ) =>
                item.id ===
                editingId
                  ? event
                  : item
            )
        );
      } else {
        setEvents(
          (
            current
          ) => [
            ...current,
            event,
          ]
        );
      }

      closeModal();
    } catch (
      error: any
    ) {
      console.error(
        "DAYFRAME save exception:",
        error
      );

      const message =
        error?.message ??
        "Unknown error";

      alert(
        `Could not save event.\n\n${message}`
      );
    }
  }

  /* =========================================================
     DELETE EVENT
  ========================================================= */

  async function deleteEvent(
    eventOrId:
      | string
      | CalendarEvent
  ) {
    if (!userId) {
      alert(
        "Your session is not ready. Please sign in again."
      );

      router.replace(
        "/auth"
      );

      return;
    }

    const baseId =
      getBaseEventId(
        eventOrId
      );

    if (!baseId) {
      alert(
        "Could not delete the event because its ID is missing."
      );

      return;
    }

    try {
      setSupabaseError(
        null
      );

      const result =
        await supabase
          .from(
            "events"
          )
          .delete()
          .eq(
            "id",
            baseId
          )
          .eq(
            "user_id",
            userId
          );

      if (
        result.error
      ) {
        console.error(
          "DAYFRAME delete error:",
          result.error
        );

        setSupabaseError(
          result.error.message
        );

        alert(
          `Could not delete event.\n\n${result.error.message}`
        );

        return;
      }

      setEvents(
        (
          current
        ) =>
          current.filter(
            (event) =>
              getBaseEventId(
                event
              ) !==
              baseId
          )
      );

      setNotifications(
        (
          current
        ) =>
          current.filter(
            (
              item
            ) =>
              getBaseEventId(
                item.eventId
              ) !==
              baseId
          )
      );

      closeModal();
    } catch (
      error: any
    ) {
      const message =
        error?.message ??
        "Unknown error";

      console.error(
        "DAYFRAME delete exception:",
        error
      );

      alert(
        `Could not delete event.\n\n${message}`
      );
    }
  }

  /* =========================================================
     TOGGLE TASK
  ========================================================= */

  async function toggleTask(
    eventOrId:
      | string
      | CalendarEvent
  ) {
    const baseId =
      getBaseEventId(
        eventOrId
      );

    if (!baseId) {
      return;
    }

    const original =
      events.find(
        (event) =>
          event.id ===
          baseId
      );

    if (!original) {
      return;
    }

    const completed =
      !original.completed;

    setEvents(
      (
        current
      ) =>
        current.map(
          (event) =>
            event.id ===
            baseId
              ? {
                  ...event,
                  completed,
                }
              : event
        )
    );

    if (!userId) {
      return;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "events"
        )
        .update({
          completed,
        })
        .eq(
          "id",
          baseId
        )
        .eq(
          "user_id",
          userId
        );

    if (
      error
    ) {
      console.error(
        "DAYFRAME task update error:",
        error
      );

      setEvents(
        (
          current
        ) =>
          current.map(
            (
              event
            ) =>
              event.id ===
              baseId
                ? original
                : event
          )
      );
    }
  }

  /* =========================================================
     DRAG START
  ========================================================= */

  function handleDragStart(
    event: CalendarEvent,
    e: React.DragEvent
  ) {
    e.stopPropagation();

    setDraggedEvent(
      event
    );

    e.dataTransfer.effectAllowed =
      "move";

    e.dataTransfer.setData(
      "text/plain",
      getBaseEventId(
        event
      )
    );
  }

  function handleDragEnd() {
    setDraggedEvent(
      null
    );

    dragJustEndedRef.current =
      true;

    window.setTimeout(
      () => {
        dragJustEndedRef.current =
          false;
      },
      100
    );
  }

  /* =========================================================
     MOVE EVENT
  ========================================================= */

  async function moveEventToDate(
    eventOrId:
      | string
      | CalendarEvent,
    targetDate: string,
    targetTime?: string
  ) {
    const baseId =
      getBaseEventId(
        eventOrId
      );

    if (!baseId) {
      return;
    }

    const original =
      events.find(
        (event) =>
          event.id ===
          baseId
      );

    if (!original) {
      return;
    }

    const nextTime =
      targetTime ??
      original.time;

    const nextAllDay =
      targetTime ===
        undefined
        ? original.allDay
        : false;

    const updated: CalendarEvent =
      normalizeEvent({
        ...original,
        date:
          targetDate,
        time:
          nextTime,
        allDay:
          nextAllDay,
      });

    setEvents(
      (
        current
      ) =>
        current.map(
          (
            event
          ) =>
            event.id ===
            baseId
              ? updated
              : event
        )
    );

    if (!userId) {
      return;
    }

    const {
      error,
    } =
      await supabase
        .from(
          "events"
        )
        .update({
          date:
            targetDate,
          time:
            nextAllDay
              ? "00:00:00"
              : `${nextTime}:00`,
          all_day:
            nextAllDay,
        })
        .eq(
          "id",
          baseId
        )
        .eq(
          "user_id",
          userId
        );

    if (
      error
    ) {
      console.error(
        "DAYFRAME drag update error:",
        error
      );

      setEvents(
        (
          current
        ) =>
          current.map(
            (
              event
            ) =>
              event.id ===
              baseId
                ? original
                : event
          )
      );

      alert(
        `Could not move event.\n\n${error.message}`
      );
    }
  }

  function handleDragOver(
    e: React.DragEvent
  ) {
    e.preventDefault();

    e.dataTransfer.dropEffect =
      "move";
  }

  function handleDropOnDay(
    targetDate: string,
    e: React.DragEvent
  ) {
    e.preventDefault();

    const id =
      e.dataTransfer.getData(
        "text/plain"
      ) ||
      draggedEvent?.id;

    if (!id) {
      return;
    }

    const source =
      events.find(
        (event) =>
          event.id ===
          getBaseEventId(
            id
          )
      );

    if (!source) {
      return;
    }

    void moveEventToDate(
      source,
      targetDate
    );

    setDraggedEvent(
      null
    );
  }

  function handleDropOnSlot(
    targetDate: string,
    hour: number,
    e: React.DragEvent
  ) {
    e.preventDefault();

    const id =
      e.dataTransfer.getData(
        "text/plain"
      ) ||
      draggedEvent?.id;

    if (!id) {
      return;
    }

    const source =
      events.find(
        (event) =>
          event.id ===
          getBaseEventId(
            id
          )
      );

    if (!source) {
      return;
    }

    const rect =
      e.currentTarget.getBoundingClientRect();

    const relativeY =
      e.clientY -
      rect.top;

    const slotHeight =
      rect.height;

    const minute =
      Math.round(
        ((relativeY /
          slotHeight) *
          60) /
          5
      ) *
      5;

    const clampedMinute =
      Math.max(
        0,
        Math.min(
          55,
          minute
        )
      );

    const time =
      `${String(
        hour
      ).padStart(
        2,
        "0"
      )}:${String(
        clampedMinute
      ).padStart(
        2,
        "0"
      )}`;

    void moveEventToDate(
      source,
      targetDate,
      time
    );

    setDraggedEvent(
      null
    );
  }

  /* =========================================================
     EVENT CLICK
  ========================================================= */

  function handleEventClick(
    event: CalendarEvent,
    e?: React.MouseEvent
  ) {
    e?.stopPropagation();

    if (
      dragJustEndedRef.current
    ) {
      return;
    }

    openEditEvent(
      event
    );
  }

  /* =========================================================
     NOTIFICATIONS
  ========================================================= */

  function createNotification(
    event: CalendarEvent,
    kind:
      | "reminder"
      | "overdue",
    message: string
  ) {
    setNotifications(
      (
        current
      ) => {
        const exists =
          current.some(
            (
              item
            ) =>
              item.eventId ===
                getBaseEventId(
                  event
                ) &&
              item.kind ===
                kind
          );

        if (
          exists
        ) {
          return current;
        }

        return [
          {
            id:
              crypto.randomUUID(),
            eventId:
              getBaseEventId(
                event
              ),
            title:
              event.title,
            message,
            createdAt:
              new Date().toISOString(),
            read:
              false,
            kind,
          },
          ...current,
        ];
      }
    );
  }

  function sendBrowserNotification(
    title: string,
    body: string
  ) {
    if (
      typeof window !==
        "undefined" &&
      "Notification" in
        window &&
      Notification.permission ===
        "granted"
    ) {
      new Notification(
        title,
        {
          body,
        }
      );
    }
  }

  async function requestNotificationPermission() {
    if (
      typeof window ===
        "undefined" ||
      !(
        "Notification" in
        window
      )
    ) {
      return;
    }

    const permission =
      await Notification.requestPermission();

    setNotificationPermission(
      permission
    );
  }

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          const now =
            new Date();

          events.forEach(
            (
              event
            ) => {
              if (
                event.completed ||
                event.allDay ||
                event.reminderMinutes ===
                  0 ||
                event.repeat !==
                  "none"
              ) {
                return;
              }

              const eventTime =
                new Date(
                  `${event.date}T${event.time}:00`
                );

              const reminderTime =
                new Date(
                  eventTime.getTime() -
                    (event.reminderMinutes ??
                      0) *
                      60_000
                );

              const key =
                `${event.id}-${event.date}-${event.time}`;

              if (
                now >=
                  reminderTime &&
                now <
                  eventTime &&
                !notifiedReminders.current.has(
                  key
                )
              ) {
                notifiedReminders.current.add(
                  key
                );

                const message =
                  `${event.title} starts at ${formatTime(
                    event.time
                  )}.`;

                createNotification(
                  event,
                  "reminder",
                  message
                );

                sendBrowserNotification(
                  "DAYFRAME Reminder",
                  message
                );
              }
            }
          );
        },
        10_000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [
    events,
    mounted,
  ]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          const now =
            new Date();

          events.forEach(
            (
              event
            ) => {
              if (
                event.completed ||
                event.allDay ||
                event.repeat !==
                  "none"
              ) {
                return;
              }

              const eventTime =
                new Date(
                  `${event.date}T${event.time}:00`
                );

              if (
                eventTime <
                  now &&
                !notifiedOverdue.current.has(
                  event.id
                )
              ) {
                notifiedOverdue.current.add(
                  event.id
                );

                createNotification(
                  event,
                  "overdue",
                  "This task is overdue."
                );
              }
            }
          );
        },
        30_000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [
    events,
    mounted,
  ]);

  function markAllNotificationsRead() {
    setNotifications(
      (
        current
      ) =>
        current.map(
          (
            item
          ) => ({
            ...item,
            read:
              true,
          })
        )
    );
  }

  function clearNotifications() {
    setNotifications(
      []
    );
  }

  /* =========================================================
     SIGN OUT
  ========================================================= */

  async function handleSignOut() {
    try {
      const {
        error,
      } =
        await supabase.auth.signOut();

      if (
        error
      ) {
        console.error(
          "DAYFRAME sign out error:",
          error
        );

        alert(
          `Could not sign out.\n\n${error.message}`
        );

        return;
      }

      setEvents(
        []
      );

      setUserId(
        ""
      );

      setUserEmail(
        ""
      );

      router.replace(
        "/auth"
      );

      router.refresh();
    } catch (
      error: any
    ) {
      console.error(
        "DAYFRAME sign out exception:",
        error
      );

      alert(
        `Could not sign out.\n\n${
          error?.message ??
          "Unknown error"
        }`
      );
    }
  }

  /* =========================================================
     EVENT COLORS
  ========================================================= */

  function getEventColor(
    event: CalendarEvent
  ) {
    return (
      CATEGORY_META[
        event.category ??
          "other"
      ].dot
    );
  }

  function isOverdue(
    event: CalendarEvent
  ) {
    if (
      event.completed ||
      event.allDay ||
      event.type !==
        "task" ||
      event.repeat !==
        "none"
    ) {
      return false;
    }

    return (
      new Date(
        `${event.date}T${event.time}:00`
      ) <
      new Date()
    );
  }

  /* =========================================================
     EVENT CARD
  ========================================================= */

  function EventCard({
    event,
    compact = false,
  }: {
    event: CalendarEvent;
    compact?: boolean;
  }) {
    return (
      <div
        draggable
        onDragStart={(e) =>
          handleDragStart(
            event,
            e
          )
        }
        onDragEnd={
          handleDragEnd
        }
        onClick={(e) =>
          handleEventClick(
            event,
            e
          )
        }
        className={[
          "calendar-event",
          "group relative cursor-grab rounded-lg border bg-white transition",
          "active:cursor-grabbing hover:-translate-y-[1px] hover:shadow-sm",
          compact
            ? "px-2 py-1.5"
            : "px-2.5 py-2",
          event.completed
            ? "opacity-50"
            : "",
        ].join(
          " "
        )}
        style={{
          borderLeftWidth:
            3,
          borderLeftColor:
            getEventColor(
              event
            ),
        }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {event.type ===
            "task" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();

                void toggleTask(
                  event
                );
              }}
              className={[
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                event.completed
                  ? "border-[#711f2d] bg-[#711f2d] text-white"
                  : "border-black/20 bg-white",
              ].join(
                " "
              )}
            >
              {event.completed && (
                <Check size={9} />
              )}
            </button>
          )}

          <span
            className={[
              "truncate font-semibold",
              compact
                ? "text-[10px]"
                : "text-[11px]",
              event.completed
                ? "line-through"
                : "",
            ].join(
              " "
            )}
          >
            {event.title}
          </span>
        </div>

        {!compact && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[9px] text-black/40">
              {event.allDay
                ? "All day"
                : formatTime(
                    event.time
                  )}
            </span>

            {event.repeat !==
              "none" && (
              <span className="text-[9px] text-[#711f2d]">
                ↻
              </span>
            )}
          </div>
        )}

        {isOverdue(
          event
        ) && (
          <span className="mt-1 block text-[8px] font-bold uppercase tracking-wider text-red-600">
            Overdue
          </span>
        )}
      </div>
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */

  if (
    !mounted ||
    loading
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f4ee]">
        <div className="text-center">
          <div className="text-2xl font-black tracking-[-0.06em]">
            DAYFRAME
          </div>

          <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-black/35">
            Loading your calendar
          </div>
        </div>
      </main>
    );
  }

  if (!userId) {
    return null;
  }

  return (
    <main className="dayframe-calendar min-h-screen overflow-x-hidden bg-[#f7f4ee] text-[#171717]">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="border-b border-black/10 bg-[#faf8f3]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6 lg:px-10 lg:py-5">
          <div>
            <div className="text-2xl font-black tracking-[-0.06em]">
              DAYFRAME
            </div>

            <div className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.25em] text-black/40 sm:block">
              Your life, in view.
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center rounded-full border border-black/10 bg-white px-4 py-2.5 md:flex">
              <Search
                size={15}
                className="mr-2 text-black/35"
              />

              <input
                value={
                  searchQuery
                }
                onChange={(e) =>
                  setSearchQuery(
                    e.target.value
                  )
                }
                placeholder="Search"
                className="w-36 bg-transparent text-sm outline-none placeholder:text-black/30"
              />
            </div>

            <div
              ref={
                notificationPanelRef
              }
              className="relative"
            >
              <button
                type="button"
                onClick={() =>
                  setShowNotifications(
                    (value) =>
                      !value
                  )
                }
                className="relative rounded-full p-2.5 transition hover:bg-black/5 sm:p-3"
              >
                <Bell size={18} />

                {unreadCount >
                  0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#711f2d] px-1 text-[8px] font-bold text-white">
                    {unreadCount >
                    9
                      ? "9+"
                      : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-black/10 bg-[#faf8f3] shadow-2xl">
                  <div className="flex items-center justify-between border-b border-black/10 px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold">
                        Notifications
                      </p>

                      <p className="mt-1 text-[10px] text-black/35">
                        {unreadCount} unread
                      </p>
                    </div>

                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={
                          markAllNotificationsRead
                        }
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[#711f2d] hover:bg-[#711f2d]/5"
                      >
                        Mark read
                      </button>

                      <button
                        type="button"
                        onClick={
                          clearNotifications
                        }
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold text-black/35 hover:bg-black/5"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length ===
                    0 ? (
                      <div className="px-5 py-10 text-center">
                        <Bell
                          size={
                            24
                          }
                          className="mx-auto mb-2 text-black/15"
                        />

                        <p className="text-sm font-medium">
                          You&apos;re all caught up.
                        </p>

                        <p className="mt-1 text-xs text-black/35">
                          New reminders appear here.
                        </p>
                      </div>
                    ) : (
                      notifications.map(
                        (
                          notification
                        ) => (
                          <button
                            type="button"
                            key={
                              notification.id
                            }
                            onClick={() => {
                              const event =
                                events.find(
                                  (
                                    item
                                  ) =>
                                    item.id ===
                                    notification.eventId
                                );

                              if (
                                event
                              ) {
                                selectDate(
                                  parseISO(
                                    event.date
                                  )
                                );

                                openEditEvent(
                                  event
                                );
                              }

                              setNotifications(
                                (
                                  current
                                ) =>
                                  current.map(
                                    (
                                      item
                                    ) =>
                                      item.id ===
                                      notification.id
                                        ? {
                                            ...item,
                                            read: true,
                                          }
                                        : item
                                  )
                              );

                              setShowNotifications(
                                false
                              );
                            }}
                            className="w-full border-b border-black/5 px-4 py-4 text-left hover:bg-black/[0.02]"
                          >
                            <div className="flex gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#711f2d]/10 text-[#711f2d]">
                                {notification.kind ===
                                "overdue" ? (
                                  <AlertTriangle size={15} />
                                ) : (
                                  <Bell size={15} />
                                )}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold">
                                  {
                                    notification.title
                                  }
                                </p>

                                <p className="mt-1 text-[10px] leading-4 text-black/45">
                                  {
                                    notification.message
                                  }
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={
                goToToday
              }
              className="hidden rounded-full border border-black/10 bg-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition hover:border-black/20 sm:block"
            >
              Today
            </button>

            <button
              type="button"
              onClick={() =>
                openAddEvent()
              }
              className="flex items-center gap-1.5 rounded-full bg-[#711f2d] px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-[#5f1926] sm:px-4"
            >
              <Plus size={14} />
              <span>
                Add
              </span>
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 md:hidden">
          <div className="flex items-center rounded-full border border-black/10 bg-white px-3 py-2.5">
            <Search
              size={14}
              className="mr-2 text-black/35"
            />

            <input
              value={
                searchQuery
              }
              onChange={(e) =>
                setSearchQuery(
                  e.target.value
                )
              }
              placeholder="Search events..."
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-black/30"
            />
          </div>
        </div>
      </header>

      {/* =====================================================
          MAIN
      ===================================================== */}

      <div className="mx-auto max-w-[1600px] px-3 py-5 sm:px-5 sm:py-6 lg:px-10 lg:py-8">
        <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              {viewMode ===
              "month"
                ? `${format(
                    displayedMonthDate,
                    "MMMM"
                  )} ${year}`
                : viewMode ===
                  "week"
                ? weekStart
                  ? `${format(
                      weekStart,
                      "MMM d"
                    )} – ${format(
                      addDays(
                        weekStart,
                        6
                      ),
                      "MMM d, yyyy"
                    )}`
                  : ""
                : format(
                    selectedDate,
                    "EEEE, MMMM d, yyyy"
                  )}
            </h1>

            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-black/30">
              {viewMode ===
              "month"
                ? "Monthly overview"
                : viewMode ===
                  "week"
                ? "Weekly overview"
                : "Daily timeline"}
            </p>
          </div>

          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <div className="flex rounded-full border border-black/10 bg-white p-1">
              {(
                [
                  "month",
                  "week",
                  "day",
                ] as ViewMode[]
              ).map(
                (
                  mode
                ) => (
                  <button
                    type="button"
                    key={
                      mode
                    }
                    onClick={() =>
                      setViewMode(
                        mode
                      )
                    }
                    className={`rounded-full px-3 py-2 text-[9px] font-bold uppercase tracking-wider sm:px-4 ${
                      viewMode ===
                      mode
                        ? "bg-[#171717] text-white"
                        : "text-black/40"
                    }`}
                  >
                    {mode}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={
                  viewMode ===
                  "month"
                    ? previousMonth
                    : viewMode ===
                      "week"
                    ? previousWeek
                    : previousDay
                }
                className="rounded-full p-2.5 hover:bg-black/5"
              >
                <ChevronLeft
                  size={
                    18
                  }
                />
              </button>

              <button
                type="button"
                onClick={
                  viewMode ===
                  "month"
                    ? nextMonth
                    : viewMode ===
                      "week"
                    ? nextWeek
                    : nextDay
                }
                className="rounded-full p-2.5 hover:bg-black/5"
              >
                <ChevronRight
                  size={
                    18
                  }
                />
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          <button
            type="button"
            onClick={() =>
              setCategoryFilter(
                "all"
              )
            }
            className={`shrink-0 rounded-full border px-3 py-2 text-[9px] font-bold uppercase tracking-wider ${
              categoryFilter ===
              "all"
                ? "border-[#711f2d] bg-[#711f2d] text-white"
                : "border-black/10 bg-white text-black/40"
            }`}
          >
            All
          </button>

          {Object.entries(
            CATEGORY_META
          ).map(
            ([
              key,
              meta,
            ]) => (
              <button
                type="button"
                key={
                  key
                }
                onClick={() =>
                  setCategoryFilter(
                    key as EventCategory
                  )
                }
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[9px] font-bold uppercase tracking-wider ${
                  categoryFilter ===
                  key
                    ? "border-black/20 bg-white text-black"
                    : "border-black/10 bg-transparent text-black/35"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      meta.dot,
                  }}
                />

                {
                  meta.label
                }
              </button>
            )
          )}
        </div>

        <div className="mb-5 hidden items-center gap-2 lg:flex">
          <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.18em] text-black/30">
            Filter
          </span>

          <button
            type="button"
            onClick={() =>
              setCategoryFilter(
                "all"
              )
            }
            className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${
              categoryFilter ===
              "all"
                ? "bg-[#171717] text-white"
                : "bg-white text-black/35"
            }`}
          >
            All
          </button>

          {Object.entries(
            CATEGORY_META
          ).map(
            ([
              key,
              meta,
            ]) => (
              <button
                type="button"
                key={
                  key
                }
                onClick={() =>
                  setCategoryFilter(
                    key as EventCategory
                  )
                }
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${
                  categoryFilter ===
                  key
                    ? "bg-white text-black"
                    : "text-black/35"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      meta.dot,
                  }}
                />

                {
                  meta.label
                }
              </button>
            )
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="dayframe-main-calendar overflow-hidden rounded-2xl border border-black/10 bg-[#faf8f3]">
            {viewMode ===
              "month" && (
              <>
                <div className="calendar-grid grid grid-cols-7 border-b border-black/10">
                  {[
                    "Sun",
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                  ].map(
                    (
                      day
                    ) => (
                      <div
                        key={
                          day
                        }
                        className="px-1 py-3 text-center text-[8px] font-bold uppercase tracking-[0.12em] text-black/30 sm:px-3 sm:text-[9px]"
                      >
                        {day}
                      </div>
                    )
                  )}
                </div>

                <div className="calendar-grid grid grid-cols-7">
                  {calendarDays.map(
                    (
                      day,
                      index
                    ) => {
                      if (
                        day ===
                        null
                      ) {
                        return (
                          <div
                            key={`empty-${index}`}
                            className="calendar-day min-h-[86px] border-b border-r border-black/5 bg-black/[0.008] sm:min-h-[125px]"
                          />
                        );
                      }

                      const date =
                        new Date(
                          year,
                          month,
                          day
                        );

                      const dateKey =
                        getDateKey(
                          date
                        );

                      const dayEvents =
                        visibleEvents.filter(
                          (
                            event
                          ) =>
                            event.date ===
                            dateKey
                        );

                      const selected =
                        selectedDay ===
                        day;

                      return (
                        <div
                          key={
                            day
                          }
                          onClick={() =>
                            setSelectedDay(
                              day
                            )
                          }
                          onDragOver={
                            handleDragOver
                          }
                          onDrop={(
                            e
                          ) =>
                            handleDropOnDay(
                              dateKey,
                              e
                            )
                          }
                          className={[
                            "calendar-day min-h-[86px] cursor-pointer border-b border-r border-black/5 p-1.5 transition sm:min-h-[125px] sm:p-2.5",
                            selected
                              ? "bg-[#711f2d]/[0.035]"
                              : "hover:bg-black/[0.018]",
                          ].join(
                            " "
                          )}
                        >
                          <div className="mb-1.5 flex items-center justify-between sm:mb-2">
                            <span
                              className={[
                                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold sm:h-7 sm:w-7 sm:text-xs",
                                isToday(
                                  date
                                )
                                  ? "bg-[#711f2d] text-white"
                                  : selected
                                  ? "bg-black/10"
                                  : "text-black/45",
                              ].join(
                                " "
                              )}
                            >
                              {day}
                            </span>

                            {dayEvents.length >
                              0 && (
                              <span className="hidden text-[8px] text-black/25 sm:block">
                                {
                                  dayEvents.length
                                }
                              </span>
                            )}
                          </div>

                          <div className="space-y-1">
                            {dayEvents
                              .slice(
                                0,
                                3
                              )
                              .map(
                                (
                                  event
                                ) => (
                                  <EventCard
                                    key={
                                      event.id
                                    }
                                    event={
                                      event
                                    }
                                    compact
                                  />
                                )
                              )}

                            {dayEvents.length >
                              3 && (
                              <div className="px-1 text-[8px] font-semibold text-black/25 sm:px-2">
                                +
                                {dayEvents.length -
                                  3}{" "}
                                more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </>
            )}

            {viewMode ===
              "week" && (
              <div className="time-calendar overflow-x-auto">
                <div className="min-w-[850px]">
                  <div className="grid grid-cols-[62px_repeat(7,minmax(0,1fr))] border-b border-black/10">
                    <div className="border-r border-black/5" />

                    {weekDates.map(
                      (
                        date
                      ) => (
                        <button
                          key={getDateKey(
                            date
                          )}
                          type="button"
                          onClick={() =>
                            selectDate(
                              date
                            )
                          }
                          className={`border-r border-black/5 px-2 py-4 text-center ${
                            getDateKey(
                              date
                            ) ===
                            selectedDateString
                              ? "bg-[#711f2d]/[0.035]"
                              : ""
                          }`}
                        >
                          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-black/30">
                            {format(
                              date,
                              "EEE"
                            )}
                          </div>

                          <div
                            className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                              isToday(
                                date
                              )
                                ? "bg-[#711f2d] text-white"
                                : "text-black/55"
                            }`}
                          >
                            {format(
                              date,
                              "d"
                            )}
                          </div>
                        </button>
                      )
                    )}
                  </div>

                  <div className="max-h-[720px] overflow-auto">
                    <div className="grid min-h-[58px] grid-cols-[62px_repeat(7,minmax(0,1fr))] border-b border-black/10">
                      <div className="border-r border-black/5 px-2 pt-3 text-right text-[8px] font-bold uppercase text-black/25">
                        All day
                      </div>

                      {weekDates.map(
                        (
                          date
                        ) => {
                          const dateKey =
                            getDateKey(
                              date
                            );

                          const allDayEvents =
                            visibleEvents.filter(
                              (
                                event
                              ) =>
                                event.date ===
                                  dateKey &&
                                event.allDay
                            );

                          return (
                            <div
                              key={
                                dateKey
                              }
                              onDragOver={
                                handleDragOver
                              }
                              onDrop={(
                                e
                              ) =>
                                handleDropOnDay(
                                  dateKey,
                                  e
                                )
                              }
                              className="border-r border-black/5 p-1"
                            >
                              <div className="space-y-1">
                                {allDayEvents.map(
                                  (
                                    event
                                  ) => (
                                    <EventCard
                                      key={
                                        event.id
                                      }
                                      event={
                                        event
                                      }
                                      compact
                                    />
                                  )
                                )}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>

                    {Array.from(
                      {
                        length:
                          17,
                      },
                      (
                        _,
                        index
                      ) =>
                        index +
                        7
                    ).map(
                      (
                        hour
                      ) => (
                        <div
                          key={
                            hour
                          }
                          className="grid min-h-[72px] grid-cols-[62px_repeat(7,minmax(0,1fr))] border-b border-black/5"
                        >
                          <div className="border-r border-black/5 px-2 pt-2 text-right text-[8px] font-medium text-black/25">
                            {format(
                              new Date(
                                2026,
                                0,
                                1,
                                hour
                              ),
                              "h a"
                            )}
                          </div>

                          {weekDates.map(
                            (
                              date
                            ) => {
                              const dateKey =
                                getDateKey(
                                  date
                                );

                              const hourEvents =
                                visibleEvents.filter(
                                  (
                                    event
                                  ) =>
                                    event.date ===
                                      dateKey &&
                                    !event.allDay &&
                                    getHour(
                                      event.time
                                    ) ===
                                      hour
                                );

                              return (
                                <div
                                  key={`${dateKey}-${hour}`}
                                  onClick={() =>
                                    openAddEvent(
                                      new Date(
                                        date.getFullYear(),
                                        date.getMonth(),
                                        date.getDate(),
                                        hour,
                                        0
                                      ),
                                      `${String(
                                        hour
                                      ).padStart(
                                        2,
                                        "0"
                                      )}:00`
                                    )
                                  }
                                  onDragOver={
                                    handleDragOver
                                  }
                                  onDrop={(
                                    e
                                  ) =>
                                    handleDropOnSlot(
                                      dateKey,
                                      hour,
                                      e
                                    )
                                  }
                                  className="relative border-r border-black/5 p-1 transition hover:bg-black/[0.018]"
                                >
                                  {hourEvents.map(
                                    (
                                      event
                                    ) => (
                                      <EventCard
                                        key={
                                          event.id
                                        }
                                        event={
                                          event
                                        }
                                      />
                                    )
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {viewMode ===
              "day" && (
              <div className="time-calendar">
                <div className="border-b border-black/10 px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#711f2d]">
                        {format(
                          selectedDate,
                          "EEEE"
                        )}
                      </p>

                      <p className="mt-1 text-sm font-semibold">
                        {format(
                          selectedDate,
                          "MMMM d, yyyy"
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openAddEvent(
                          selectedDate
                        )
                      }
                      className="flex items-center gap-1.5 rounded-full bg-[#711f2d] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white"
                    >
                      <Plus
                        size={
                          12
                        }
                      />
                      Add
                    </button>
                  </div>
                </div>

                <div className="max-h-[720px] overflow-auto">
                  <div
                    onDragOver={
                      handleDragOver
                    }
                    onDrop={(
                      e
                    ) =>
                      handleDropOnDay(
                        selectedDateString,
                        e
                      )
                    }
                    className="border-b border-black/10 bg-[#711f2d]/[0.025] px-4 py-3"
                  >
                    <div className="mb-2 text-[8px] font-bold uppercase tracking-wider text-black/30">
                      All day
                    </div>

                    <div className="space-y-1.5">
                      {selectedDateEvents
                        .filter(
                          (
                            event
                          ) =>
                            event.allDay
                        )
                        .map(
                          (
                            event
                          ) => (
                            <EventCard
                              key={
                                event.id
                              }
                              event={
                                event
                              }
                            />
                          )
                        )}
                    </div>
                  </div>

                  {Array.from(
                    {
                      length:
                        17,
                    },
                    (
                      _,
                      index
                    ) =>
                      index +
                      7
                  ).map(
                    (
                      hour
                    ) => {
                      const hourEvents =
                        selectedDateEvents.filter(
                          (
                            event
                          ) =>
                            !event.allDay &&
                            getHour(
                              event.time
                            ) ===
                              hour
                        );

                      return (
                        <div
                          key={
                            hour
                          }
                          className="grid min-h-[82px] grid-cols-[62px_minmax(0,1fr)] border-b border-black/5 sm:grid-cols-[82px_minmax(0,1fr)]"
                        >
                          <div className="border-r border-black/5 px-2 pt-3 text-right text-[8px] font-medium text-black/25 sm:px-3">
                            {format(
                              new Date(
                                2026,
                                0,
                                1,
                                hour
                              ),
                              "h a"
                            )}
                          </div>

                          <div
                            onClick={() =>
                              openAddEvent(
                                new Date(
                                  selectedDate.getFullYear(),
                                  selectedDate.getMonth(),
                                  selectedDate.getDate(),
                                  hour,
                                  0
                                ),
                                `${String(
                                  hour
                                ).padStart(
                                  2,
                                  "0"
                                )}:00`
                              )
                            }
                            onDragOver={
                              handleDragOver
                            }
                            onDrop={(
                              e
                            ) =>
                              handleDropOnSlot(
                                selectedDateString,
                                hour,
                                e
                              )
                            }
                            className="relative p-2 transition hover:bg-black/[0.018]"
                          >
                            {hourEvents.map(
                              (
                                event
                              ) => (
                                <div
                                  key={
                                    event.id
                                  }
                                  className="mb-1.5"
                                >
                                  <EventCard
                                    event={
                                      event
                                    }
                                  />
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </section>

          {/* =================================================
              SIDEBAR
          ================================================= */}

          <aside className="calendar-sidebar space-y-4">
            <div className="rounded-2xl border border-black/10 bg-[#faf8f3] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#711f2d]">
                    Selected date
                  </p>

                  <h2 className="mt-2 text-xl font-semibold">
                    {format(
                      selectedDate,
                      "MMMM d"
                    )}
                  </h2>

                  <p className="mt-1 text-xs text-black/35">
                    {format(
                      selectedDate,
                      "EEEE, yyyy"
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    openAddEvent(
                      selectedDate
                    )
                  }
                  className="rounded-full bg-[#711f2d] p-2.5 text-white"
                >
                  <Plus
                    size={
                      15
                    }
                  />
                </button>
              </div>

              <div className="mt-5 border-t border-black/10 pt-4">
                {selectedDateEvents.length ===
                0 ? (
                  <div className="py-7 text-center">
                    <p className="text-sm font-medium text-black/45">
                      Nothing scheduled.
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        openAddEvent(
                          selectedDate
                        )
                      }
                      className="mt-3 text-xs font-semibold text-[#711f2d]"
                    >
                      + Add something
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDateEvents.map(
                      (
                        event
                      ) => (
                        <div
                          key={
                            event.id
                          }
                          onClick={() =>
                            openEditEvent(
                              event
                            )
                          }
                          className="cursor-pointer rounded-xl border border-black/10 bg-white p-3 transition hover:border-black/20"
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className="mt-1 h-2 w-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  getEventColor(
                                    event
                                  ),
                              }}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className={`truncate text-sm font-semibold ${
                                    event.completed
                                      ? "line-through opacity-50"
                                      : ""
                                  }`}
                                >
                                  {
                                    event.title
                                  }
                                </p>

                                <span className="shrink-0 text-[8px] uppercase tracking-wider text-black/25">
                                  {
                                    event.type
                                  }
                                </span>
                              </div>

                              <p className="mt-1 text-[10px] text-black/35">
                                {event.allDay
                                  ? "All day"
                                  : formatTime(
                                      event.time
                                    )}
                              </p>

                              {event.repeat !==
                                "none" && (
                                <p className="mt-2 text-[9px] font-semibold text-[#711f2d]">
                                  ↻{" "}
                                  {
                                    REPEAT_LABELS[
                                      event.repeat ??
                                        "none"
                                    ]
                                  }
                                </p>
                              )}

                              {event.type ===
                                "task" && (
                                <button
                                  type="button"
                                  onClick={(
                                    e
                                  ) => {
                                    e.stopPropagation();

                                    void toggleTask(
                                      event
                                    );
                                  }}
                                  className="mt-3 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#711f2d]"
                                >
                                  <span
                                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                      event.completed
                                        ? "border-[#711f2d] bg-[#711f2d] text-white"
                                        : "border-black/20"
                                    }`}
                                  >
                                    {event.completed && (
                                      <Check
                                        size={
                                          9
                                        }
                                      />
                                    )}
                                  </span>

                                  {event.completed
                                    ? "Completed"
                                    : "Mark complete"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#711f2d]/10 bg-[#711f2d]/[0.035] p-5">
              <div className="flex gap-3">
                <Bell
                  size={
                    16
                  }
                  className="mt-0.5 text-[#711f2d]"
                />

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#711f2d]">
                    Reminders
                  </p>

                  <p className="mt-2 text-xs leading-5 text-black/40">
                    Receive browser notifications before important tasks.
                  </p>

                  {notificationPermission !==
                  "granted" ? (
                    <button
                      type="button"
                      onClick={
                        requestNotificationPermission
                      }
                      className="mt-3 rounded-full bg-[#711f2d] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white"
                    >
                      Enable
                    </button>
                  ) : (
                    <div className="mt-3 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#711f2d]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#711f2d]" />
                      Enabled
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden rounded-2xl border border-black/10 bg-[#faf8f3] p-5 lg:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-black/30">
                Categories
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {Object.entries(
                  CATEGORY_META
                ).map(
                  ([
                    key,
                    meta,
                  ]) => (
                    <button
                      type="button"
                      key={
                        key
                      }
                      onClick={() =>
                        setCategoryFilter(
                          key as EventCategory
                        )
                      }
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor:
                            meta.dot,
                        }}
                      />

                      <span className="text-[10px] text-black/45">
                        {
                          meta.label
                        }
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-[#faf8f3] p-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-black/30">
                Account
              </p>

              <p className="mt-2 truncate text-xs font-medium">
                {userEmail}
              </p>

              <button
                type="button"
                onClick={
                  handleSignOut
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[9px] font-bold uppercase tracking-wider text-black/45 transition hover:border-[#711f2d]/30 hover:text-[#711f2d]"
              >
                <LogOut
                  size={
                    13
                  }
                />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {supabaseError && (
        <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <span>
              Supabase:{" "}
              {
                supabaseError
              }
            </span>

            <button
              type="button"
              onClick={() =>
                setSupabaseError(
                  null
                )
              }
            >
              <X
                size={
                  14
                }
              />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          MODAL

          FIX:
          AddEventModal expects `event`, not `initialData`.
      ===================================================== */}

      {showModal &&
        editingEvent && (
          <AddEventModal
            open={
              true
            }
            event={
              editingEvent
            }
            onClose={
              closeModal
            }
            onSave={
              saveEvent
            }
            onDelete={
              editingEvent.id
                ? () =>
                    void deleteEvent(
                      editingEvent
                    )
                : undefined
            }
          />
        )}
    </main>
  );
}