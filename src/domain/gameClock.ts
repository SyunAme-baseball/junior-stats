/** 試合時間（分）。少年野球は 5・6年生が90分、4年生以下が80分のことが多い */
export const TIME_LIMIT_OPTIONS = [60, 70, 80, 90, 100, 120, 0];

export function defaultTimeLimit(category?: string): number {
  return category === "6年生" || category === "5年生" ? 90 : 80;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 経過時間・残り時間の表示（例：23:05、1:02:30） */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 時刻の表示（例：10:05） */
export function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

/** 試合にかかった時間（例：1時間32分） */
export function durationLabel(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h}時間${min % 60}分` : `${min}分`;
}

export type ClockStatus = "ready" | "running" | "soon" | "over" | "ended";

/** 今の状態。残り10分を切ったら soon、試合時間を過ぎたら over */
export function clockStatus(startedAt: number | undefined, endedAt: number | undefined, limitMin: number, now: number): ClockStatus {
  if (!startedAt) return "ready";
  if (endedAt) return "ended";
  if (!limitMin) return "running";
  const left = startedAt + limitMin * 60000 - now;
  return left <= 0 ? "over" : left <= 10 * 60000 ? "soon" : "running";
}
