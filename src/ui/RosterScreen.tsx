import { useMemo, useState } from "react";
import { GRADES, GRADUATED, gradeLabel } from "../domain/categories";
import { newId } from "../domain/id";
import { isActive, promoteRoster, sortRoster } from "../domain/roster";
import type { Player, TeamProfile } from "../domain/types";
import { ask, askText } from "./confirm";

type Props = {
  roster: Player[];
  teams: TeamProfile[];
  onSave: (players: Player[]) => void;
  /** 追加した選手をチームにも入れる */
  onJoin: (player: Player, teamIds: string[]) => void;
  onBack: () => void;
};

/** 名簿：クラブの選手をまとめて管理する（追加・学年・退団・進学・卒団） */
export function RosterScreen({ roster, teams, onSave, onJoin, onBack }: Props) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number>(6);
  // 追加する選手を入れられるチーム。最初は学年がいちばん近いチーム（4年生なら「4年生以下」）を選んでおく
  const [joinIds, setJoinIds] = useState<string[] | null>(null);
  const joinable = teams.filter((t) => t.maxGrade === undefined || grade <= t.maxGrade);
  const nearest = Math.min(...joinable.map((t) => t.maxGrade ?? 99));
  const joining = joinIds ?? joinable.filter((t) => (t.maxGrade ?? 99) === nearest).map((t) => t.id);

  const active = useMemo(() => sortRoster(roster.filter(isActive)), [roster]);
  const graduated = useMemo(() => sortRoster(roster.filter((p) => !p.left && (p.grade ?? 0) >= GRADUATED)), [roster]);
  const left = useMemo(() => sortRoster(roster.filter((p) => p.left)), [roster]);
  const groups = useMemo(() => {
    const m = new Map<number | undefined, Player[]>();
    for (const p of active) m.set(p.grade, [...(m.get(p.grade) ?? []), p]);
    return [...m.entries()];
  }, [active]);

  const patch = (id: string, change: Partial<Player>) => onSave(roster.map((p) => (p.id === id ? { ...p, ...change } : p)));

  const add = () => {
    const n = name.trim();
    if (!n) return;
    const player: Player = { id: newId(), name: n, grade };
    onSave([...roster, player]);
    const ids = joining.filter((id) => joinable.some((t) => t.id === id));
    if (ids.length) onJoin(player, ids);
    setName("");
  };

  const rename = async (p: Player) => {
    const n = await askText("名前を変更します。", p.name, "変更する");
    if (n?.trim()) patch(p.id, { name: n.trim() });
  };

  return (
    <main className="app">
      <header className="topbar">
        <button className="link-button" onClick={onBack}>
          ← 一覧
        </button>
        <span className="topbar-title">名簿</span>
        <span />
      </header>

      <section className="panel">
        <h2>選手を追加</h2>
        <div className="roster-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
            }}
            placeholder="名前（例：山田 太郎）"
            aria-label="追加する選手の名前"
          />
          <select
            value={grade}
            onChange={(e) => {
              setGrade(Number(e.target.value));
              setJoinIds(null);
            }}
            aria-label="追加する選手の学年"
          >
            {[...GRADES].reverse().map((g) => (
              <option key={g} value={g}>
                {g}年生
              </option>
            ))}
          </select>
          <button className="primary-button" disabled={!name.trim()} onClick={add}>
            追加
          </button>
        </div>
        {joinable.length > 0 && (
          <div className="roster-join">
            <span className="muted small">このチームにも入れる：</span>
            {joinable.map((t) => (
              <label key={t.id} className="check-chip">
                <input
                  type="checkbox"
                  checked={joining.includes(t.id)}
                  onChange={(e) => setJoinIds(e.target.checked ? [...joining, t.id] : joining.filter((id) => id !== t.id))}
                />
                {t.name}
              </label>
            ))}
          </div>
        )}
        <p className="muted small">続けて入れるときは、名前を入れて Enter（改行）でも追加できます。学年は前の人と同じまま残ります。</p>
      </section>

      <section className="panel">
        <h2>今いる選手（{active.length}人）</h2>
        {active.length === 0 && <p className="empty-state">まだ選手がいません。上の「選手を追加」から入れてください。</p>}
        {groups.map(([g, players]) => (
          <div key={g ?? "none"} className="grade-group">
            <h3>
              {gradeLabel(g)}（{players.length}人）
            </h3>
            <ul className="roster-list">
              {players.map((p) => (
                <li key={p.id}>
                  <button className="roster-name" onClick={() => rename(p)} aria-label={`${p.name}の名前を変更`}>
                    {p.name}
                  </button>
                  <select
                    value={p.grade ?? ""}
                    onChange={(e) => patch(p.id, { grade: e.target.value ? Number(e.target.value) : undefined })}
                    aria-label={`${p.name}の学年`}
                  >
                    <option value="">学年未設定</option>
                    {GRADES.map((x) => (
                      <option key={x} value={x}>
                        {x}年生
                      </option>
                    ))}
                    <option value={GRADUATED}>卒団</option>
                  </select>
                  <button
                    className="link-button danger"
                    onClick={async () => {
                      if (await ask(`${p.name}を退団にします。チームの選手選びに出なくなりますが、これまでの成績は残ります。`, "退団にする"))
                        patch(p.id, { left: true });
                    }}
                  >
                    退団
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>新年度（進学）</h2>
        <p className="muted">
          今いる選手全員の学年を1つ上げます。6年生は「卒団」になり、チームの選手選びに出なくなります。過去の試合の記録・成績はそのまま残ります。
        </p>
        <button
          className="secondary-button"
          disabled={active.length === 0}
          onClick={async () => {
            if (await ask("今いる選手全員の学年を1つ上げます（6年生は卒団）。", "学年を上げる", false)) onSave(promoteRoster(roster));
          }}
        >
          全員の学年を1つ上げる
        </button>
        {teams.length > 0 && (
          <p className="muted small">進学したあとは、各チームの画面の「メンバーを選び直す」で、新しく入る学年の選手を加えてください。</p>
        )}
      </section>

      {graduated.length > 0 && (
        <details className="panel roster-fold">
          <summary>卒団した選手（{graduated.length}人）</summary>
          <ul className="roster-list">
            {graduated.map((p) => (
              <li key={p.id}>
                <span className="roster-name">{p.name}</span>
                <button className="link-button" onClick={() => patch(p.id, { grade: 6 })}>
                  6年生に戻す
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {left.length > 0 && (
        <details className="panel roster-fold">
          <summary>退団した選手（{left.length}人）</summary>
          <ul className="roster-list">
            {left.map((p) => (
              <li key={p.id}>
                <span className="roster-name">
                  {p.name}
                  <small>{gradeLabel(p.grade)}</small>
                </span>
                <button className="link-button" onClick={() => patch(p.id, { left: undefined })}>
                  復帰
                </button>
                <button
                  className="link-button danger"
                  onClick={async () => {
                    if (
                      await ask(
                        `${p.name}を名簿から完全に削除します（入力ミスの取り消し用）。チームからも外れます。過去の試合の記録は残ります。`,
                        "削除する",
                      )
                    )
                      onSave(roster.filter((x) => x.id !== p.id));
                  }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
