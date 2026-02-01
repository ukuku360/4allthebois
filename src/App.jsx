import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "anniversary-settings-v1";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UPCOMING_PREVIEW_COUNT = 6;

const COUNT_OPTIONS = [100, 200, 300, 500, 1000];
const YEAR_OPTIONS = [1, 2, 3, 5, 10];

const HOLIDAY_OPTIONS = [
  { key: "valentine", label: "발렌타인데이", month: 2, day: 14 },
  { key: "white", label: "화이트데이", month: 3, day: 14 },
  { key: "pepero", label: "빼빼로데이", month: 11, day: 11 },
  { key: "christmas", label: "크리스마스", month: 12, day: 25 },
];

const HOLIDAY_MAP = new Map(HOLIDAY_OPTIONS.map((holiday) => [holiday.key, holiday]));

const BASE_SETTINGS = {
  inclusive: true,
  counts: COUNT_OPTIONS,
  years: YEAR_OPTIONS,
  holidays: HOLIDAY_OPTIONS.map((holiday) => holiday.key),
  yearsAhead: 5,
};

const DEFAULT_SETTINGS = {
  startDate: "",
  type: "연애 시작",
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || "";
const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT || "";
const ADSENSE_SLOTS_RAW = import.meta.env.VITE_ADSENSE_SLOTS || "";

function parseAdSlots(raw, fallback) {
  const slots = raw
    .split(",")
    .map((slot) => slot.trim())
    .filter(Boolean);
  if (slots.length) return slots;
  return fallback ? [fallback] : [];
}

const ADSENSE_SLOTS = parseAdSlots(ADSENSE_SLOTS_RAW, ADSENSE_SLOT);

function ensureAdsenseScript(clientId) {
  if (!clientId || typeof document === "undefined") return;
  const existing = document.querySelector('script[data-adsense="true"]');
  if (existing) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
  script.crossOrigin = "anonymous";
  script.dataset.adsense = "true";
  document.head.appendChild(script);
}

function App() {
  const [formState, setFormState] = useState(loadSettings);
  const [notifyStatus, setNotifyStatus] = useState("알림 꺼짐");
  const notifiedRef = useRef(new Set());
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  const today = startOfToday();
  const todayKey = today.getTime();

  const settings = useMemo(() => ({ ...BASE_SETTINGS, ...formState }), [formState]);

  const events = useMemo(() => buildEvents(settings, today), [settings, todayKey]);
  const alertEvents = useMemo(
    () => events.filter((event) => isWithinDays(event.reminderDate, today, 0, 7)),
    [events, todayKey]
  );
  const todayReminders = useMemo(
    () => events.filter((event) => diffInDays(event.reminderDate, today) === 0),
    [events, todayKey]
  );
  const upcomingHasMore = events.length > UPCOMING_PREVIEW_COUNT;
  const visibleUpcoming = useMemo(
    () => (upcomingExpanded ? events : events.slice(0, UPCOMING_PREVIEW_COUNT)),
    [events, upcomingExpanded]
  );

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    todayReminders.forEach((event) => {
      const key = `${event.id}-${formatICSDate(event.reminderDate)}`;
      if (notifiedRef.current.has(key)) return;
      new Notification("오늘 알림", {
        body: `${event.title} (${formatDate(event.date)})`,
      });
      notifiedRef.current.add(key);
    });
  }, [todayReminders]);

  const handleDownload = () => {
    if (!events.length) return;
    const content = buildICS(events);
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "anniversary-reminders.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const requestNotificationPermission = () => {
    if (!("Notification" in window)) {
      setNotifyStatus("알림 미지원");
      return;
    }
    if (Notification.permission === "granted") {
      setNotifyStatus("알림 켜짐");
      return;
    }
    Notification.requestPermission().then((permission) => {
      setNotifyStatus(permission === "granted" ? "알림 켜짐" : "알림 꺼짐");
    });
  };

  const updateField = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    saveSettings(formState);
  }, [formState]);

  const adSlots = ADSENSE_SLOTS;
  const pickAdSlot = (index) => {
    if (!adSlots.length) return "";
    return adSlots[Math.min(index, adSlots.length - 1)];
  };

  return (
    <main className="page">
      <header className="hero">
        <div className="hero__copy">
          <h1>기념일 알림 메이트</h1>
          <div className="hero__actions">
            <button className="btn btn--ghost" type="button" onClick={requestNotificationPermission}>
              알림 켜기
            </button>
            <span className="status">{notifyStatus}</span>
          </div>
        </div>
        <div className="hero__card">
          <h2>오늘</h2>
          <ul className="reminder-list" aria-live="polite">
            {todayReminders.length ? (
              todayReminders.map((event, index) => (
                <li key={event.id} className="event-item" style={{ "--delay": `${index * 0.05}s` }}>
                  {event.title} 알림 ({formatDate(event.date)})
                </li>
              ))
            ) : (
              <li className="reminder-empty">없음</li>
            )}
          </ul>
        </div>
      </header>

      <AdSection slot={pickAdSlot(0)} label="상단 광고" />

      <section className="panel">
        <form className="form" onSubmit={(event) => event.preventDefault()} autoComplete="off">
          <div className="field">
            <label htmlFor="startDate">시작일</label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={formState.startDate}
              onChange={(event) => updateField("startDate", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="anniversaryType">유형</label>
            <select
              id="anniversaryType"
              name="anniversaryType"
              value={formState.type}
              onChange={(event) => updateField("type", event.target.value)}
            >
              <option value="연애 시작">연애 시작</option>
              <option value="결혼">결혼</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div className="field field--actions">
            <button className="btn btn--ghost" type="button" onClick={handleDownload}>
              캘린더(.ics) 다운로드
            </button>
          </div>
        </form>
      </section>

      <AdSection slot={pickAdSlot(1)} label="중간 광고" />

      <section className="results">
        <div className="grid">
          <div className="card">
            <h2>이번 주</h2>
            <ul className="event-list" aria-live="polite">
              {alertEvents.length ? (
                alertEvents.map((event, index) => (
                  <EventItem key={event.id} event={event} index={index} today={today} />
                ))
              ) : (
                <li className="event-empty">없음</li>
              )}
            </ul>
          </div>
          <div className="card">
            <h2>다가오는</h2>
            <ul className="event-list" aria-live="polite">
              {visibleUpcoming.length ? (
                visibleUpcoming.map((event, index) => (
                  <EventItem key={event.id} event={event} index={index} today={today} />
                ))
              ) : (
                <li className="event-empty">없음</li>
              )}
            </ul>
            {upcomingHasMore ? (
              <button
                className="btn btn--ghost btn--expand"
                type="button"
                aria-expanded={upcomingExpanded}
                onClick={() => setUpcomingExpanded((prev) => !prev)}
              >
                {upcomingExpanded
                  ? "접기"
                  : `더 보기 (${events.length - UPCOMING_PREVIEW_COUNT}개)`}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <AdSection slot={pickAdSlot(2)} label="하단 광고" />
    </main>
  );
}

function AdSection({ slot, label }) {
  if (!slot) return null;
  return (
    <section className="ad-panel" aria-label={label}>
      <AdSlot slot={slot} />
    </section>
  );
}

function AdSlot({ slot }) {
  const adRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot) return;
    ensureAdsenseScript(ADSENSE_CLIENT);
    if (initializedRef.current) return;
    if (!adRef.current) return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      initializedRef.current = true;
    } catch (error) {
      // Ads may be blocked in development; fail silently.
    }
  }, [slot]);

  if (!ADSENSE_CLIENT || !slot) return null;

  return (
    <div className="ad-slot">
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

function EventItem({ event, index, today }) {
  const reminderDiff = diffInDays(event.reminderDate, today);
  return (
    <li className="event-item" style={{ "--delay": `${index * 0.05}s` }}>
      <strong>{event.title}</strong>
      <div className="event-item__row">
        <span className="tag tag--accent">{formatDday(event.date, today)}</span>
        <span>기념일: {formatDate(event.date)}</span>
      </div>
      <div className="event-item__row">
        <span className="tag">{formatDday(event.reminderDate, today)}</span>
        <span>알림: {formatDate(event.reminderDate)}</span>
        <span className="tag tag--muted">{reminderDiff < 0 ? "알림 지남" : "알림 예정"}</span>
      </div>
    </li>
  );
}

function buildEvents(settings, today) {
  const events = [];
  const endRange = addYears(today, Number(settings.yearsAhead));
  const startDate = parseDateInput(settings.startDate);

  if (startDate) {
    settings.counts.forEach((count) => {
      const offset = settings.inclusive ? count - 1 : count;
      const date = addDays(startDate, offset);
      events.push({
        id: `count-${count}`,
        title: `${settings.type} ${count}일`,
        date,
        category: "count",
      });
    });

    settings.years.forEach((year) => {
      const date = addYears(startDate, year);
      events.push({
        id: `year-${year}`,
        title: `${settings.type} ${year}주년`,
        date,
        category: "year",
      });
    });
  }

  const currentYear = today.getFullYear();
  for (let year = currentYear; year <= currentYear + Number(settings.yearsAhead); year += 1) {
    settings.holidays.forEach((key) => {
      const holiday = HOLIDAY_MAP.get(key);
      if (!holiday) return;
      const date = makeLocalDate(year, holiday.month, holiday.day);
      events.push({
        id: `${key}-${year}`,
        title: holiday.label,
        date,
        category: "holiday",
      });
    });
  }

  return events
    .map((event) => ({
      ...event,
      reminderDate: addDays(event.date, -7),
    }))
    .filter((event) => event.date >= today && event.date <= endRange)
    .sort((a, b) => a.date - b.date);
}

function formatDate(date) {
  return dateFormatter.format(date);
}

function formatDday(date, base) {
  const diff = diffInDays(date, base);
  if (diff === 0) return "D-Day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function diffInDays(date, base) {
  return Math.round((date.getTime() - base.getTime()) / MS_PER_DAY);
}

function isWithinDays(date, base, start, end) {
  const diff = diffInDays(date, base);
  return diff >= start && diff <= end;
}

function makeLocalDate(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return makeLocalDate(year, month, day);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function addYears(date, years) {
  const month = date.getMonth();
  const day = date.getDate();
  const targetYear = date.getFullYear() + years;
  const result = new Date(targetYear, month, day, 12, 0, 0, 0);
  if (result.getMonth() !== month) {
    return new Date(targetYear, month + 1, 0, 12, 0, 0, 0);
  }
  return result;
}

function saveSettings(settings) {
  const payload = {
    startDate: settings.startDate || "",
    type: settings.type || "연애 시작",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, settings: payload }));
}

function loadSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !parsed.settings) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      startDate: parsed.settings.startDate || "",
      type: parsed.settings.type || "연애 시작",
    };
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
}

function buildICS(events) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Anniversary Buddy//KR//",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:기념일 알림",
  ];

  events.forEach((event, index) => {
    const start = formatICSDate(event.date);
    const end = formatICSDate(addDays(event.date, 1));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${timestamp}-${index}@anniversary-buddy`,
      `DTSTAMP:${timestamp}`,
      `SUMMARY:${escapeICS(event.title)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `DESCRIPTION:알림 날짜 ${formatDate(event.reminderDate)}`,
      "BEGIN:VALARM",
      "TRIGGER:-P7D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeICS(event.title)} 알림`,
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeICS(value) {
  return String(value).replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function formatICSDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export default App;
