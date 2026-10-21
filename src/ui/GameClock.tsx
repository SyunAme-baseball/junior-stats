import { useEffect, useState } from "react";
import { clockStatus, clockTime, durationLabel, formatDuration } from "../domain/gameClock";
import type { Game } from "../domain/types";

/** 試合時間のストップウォッチ。プレイボールで開始時刻、試合終了で終了時刻を記録する */
export function GameClock({ game, locked, onChange }: { game: Game; locked?: boolean; onChange: (patch: Partial<Game>) => void }) {
  const { startedAt, endedAt } = game;
  const limit = game.timeLimit ?? 0;
  const [now, setNow] = useState(() => Date.now());
  const running = !!startedAt && !endedAt;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const status = clockStatus(startedAt, endedAt, limit, now);
  const limitLabel = limit ? `試合時間 ${limit}分` : "試合時間の制限なし";

  if (!startedAt) {
    if (locked) return null;
    return (
      <div className="game-clock ready">
        <button className="playball-button" onClick={() => onChange({ startedAt: Date.now(), endedAt: undefined })}>
          ⚾ プレイボール
        </button>
        <span className="clock-sub">{limitLabel}・押すと開始時刻を記録します</span>
      </div>
    );
  }

  if (endedAt) {
    return (
      <div className="game-clock ended">
        <span className="clock-main">
          {clockTime(startedAt)}〜{clockTime(endedAt)}（{durationLabel(endedAt - startedAt)}）
        </span>
        {!locked && (
          <button className="link-button small" onClick={() => onChange({ endedAt: undefined })}>
            終了を取り消す
          </button>
        )}
      </div>
    );
  }

  const elapsed = now - startedAt;
  const left = startedAt + limit * 60000 - now;
  return (
    <div className={`game-clock ${status}`}>
      <span className="clock-main" aria-label="経過時間">
        ⏱ {formatDuration(elapsed)}
      </span>
      <span className="clock-sub">
        {limit ? (left > 0 ? `残り ${formatDuration(left)}` : `時間切れ +${formatDuration(-left)}`) : "制限なし"}
        <br />
        開始 {clockTime(startedAt)}
      </span>
      <button className="end-clock-button" onClick={() => onChange({ endedAt: Date.now() })}>
        試合終了
      </button>
    </div>
  );
}
