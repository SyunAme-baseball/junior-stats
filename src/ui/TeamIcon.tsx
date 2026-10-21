import { useState } from "react";
import type { TeamProfile } from "../domain/types";

export const TEAM_EMOJIS = ["", "⚾", "🔥", "⭐", "⚡", "🏆", "👑", "💎", "🦅", "🐯", "🦁", "🐉", "🦈", "🐺", "🌈", "🍀", "🌸", "☀️"];
export const TEAM_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
export const TEAM_DIGITS = Array.from({ length: 10 }, (_, i) => String(i));
const isLetter = (s?: string) => !!s && /^[A-Z0-9]$/.test(s);
export const TEAM_COLORS = ["#2f7d4a", "#1f3a68", "#2a7fd4", "#138d75", "#c0392b", "#e67e22", "#d4a017", "#d6457a", "#7d3c98", "#333333"];

/** チームのアイコン（絵文字か、チーム名の1文字目） */
export function TeamIcon({ team, className = "home-team-icon" }: { team: Pick<TeamProfile, "name" | "icon">; className?: string }) {
  const emoji = team.icon?.emoji;
  return (
    <span className={emoji && !isLetter(emoji) ? `${className} emoji` : className} style={{ background: team.icon?.color ?? TEAM_COLORS[0] }} aria-hidden="true">
      {emoji || (team.name || "？").slice(0, 1)}
    </span>
  );
}

/** アイコンの絵文字と色を選ぶ */
export function TeamIconPicker({ team, onSave, onClose }: { team: TeamProfile; onSave: (icon: TeamProfile["icon"]) => void; onClose: () => void }) {
  const [emoji, setEmoji] = useState(team.icon?.emoji ?? "");
  const [color, setColor] = useState(team.icon?.color ?? TEAM_COLORS[0]);
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="チームのアイコン">
      <div className="sheet">
        <header className="sheet-header">
          <h2>チームのアイコン</h2>
          <button className="icon-button" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>
        <div className="icon-preview">
          <TeamIcon team={{ name: team.name, icon: { emoji, color } }} className="home-team-icon large" />
          <strong>{team.name}</strong>
        </div>
        <div className="field">
          マーク
          <div className="icon-grid">
            {TEAM_EMOJIS.map((e) => (
              <button key={e || "letter"} className={emoji === e ? "icon-choice on" : "icon-choice"} onClick={() => setEmoji(e)} aria-label={e || "チーム名の1文字目"}>
                {e || (team.name || "？").slice(0, 1)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          アルファベット
          <div className="icon-grid letters">
            {TEAM_LETTERS.map((l) => (
              <button key={l} className={emoji === l ? "icon-choice on" : "icon-choice"} onClick={() => setEmoji(l)} aria-label={`アルファベット ${l}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          数字
          <div className="icon-grid letters">
            {TEAM_DIGITS.map((d) => (
              <button key={d} className={emoji === d ? "icon-choice on" : "icon-choice"} onClick={() => setEmoji(d)} aria-label={`数字 ${d}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          色
          <div className="color-grid">
            {TEAM_COLORS.map((c) => (
              <button key={c} className={color === c ? "color-choice on" : "color-choice"} style={{ background: c }} onClick={() => setColor(c)} aria-label={`色 ${c}`} />
            ))}
          </div>
        </div>
        <div className="sheet-actions">
          <button className="primary-button" onClick={() => onSave({ emoji: emoji || undefined, color })}>
            このアイコンにする
          </button>
        </div>
      </div>
    </div>
  );
}
