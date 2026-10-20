import { useMemo, useState } from "react";
import { GRADES, gradeLabel } from "../domain/categories";
import { newId } from "../domain/id";
import { isActive, sortRoster, teamCandidates, teamGradeLabel } from "../domain/roster";
import type { Player, TeamProfile } from "../domain/types";

type Props = {
  roster: Player[];
  /** 既存チームのメンバーを選び直すとき。なければ新しいチームを作る */
  team?: TeamProfile;
  onSave: (team: TeamProfile) => void;
  onCancel: () => void;
  onOpenRoster: () => void;
};

/**
 * チームを作る／メンバーを選び直す。
 * 学年（例：4年生）を選ぶと、名簿から今いる4年生以下の選手が並び、チェックした選手でチームを作る。
 */
export function TeamMembers({ roster, team, onSave, onCancel, onOpenRoster }: Props) {
  const creating = !team;
  const [name, setName] = useState(team?.name ?? "");
  const [maxGrade, setMaxGrade] = useState<number>(team?.maxGrade ?? 6);
  const memberIds = useMemo(() => new Set((team?.players ?? []).map((p) => p.id)), [team]);
  const [selected, setSelected] = useState<Set<string>>(() =>
    creating ? new Set(teamCandidates(roster, maxGrade).map((p) => p.id)) : new Set(roster.filter((p) => isActive(p) && memberIds.has(p.id)).map((p) => p.id)),
  );

  // 並べる選手：学年に合う今いる選手＋（選び直しのとき）学年が上がって外れそうな今のメンバー
  const list = useMemo(() => {
    const c = teamCandidates(roster, maxGrade);
    const extra = roster.filter((p) => isActive(p) && memberIds.has(p.id) && !c.includes(p));
    return sortRoster([...c, ...extra]);
  }, [roster, maxGrade, memberIds]);
  const groups = useMemo(() => {
    const m = new Map<number | undefined, Player[]>();
    for (const p of list) m.set(p.grade, [...(m.get(p.grade) ?? []), p]);
    return [...m.entries()];
  }, [list]);

  const changeGrade = (g: number) => {
    setMaxGrade(g);
    // 新しく作るときは、学年を変えたら並んだ選手を全員選び直す
    if (creating) setSelected(new Set(teamCandidates(roster, g).map((p) => p.id)));
  };
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const setMany = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  // 合同チームで加わる他チームの選手（名簿には入れない）
  const [guests, setGuests] = useState<Player[]>(() => (team?.players ?? []).filter((p) => p.guest && !p.left));
  const [guestName, setGuestName] = useState("");
  const [guestFrom, setGuestFrom] = useState(() => guests[guests.length - 1]?.fromTeam ?? "");
  const [guestGrade, setGuestGrade] = useState<number | "">("");
  const addGuest = () => {
    const n = guestName.trim();
    if (!n) return;
    setGuests((gs) => [
      ...gs,
      { id: newId(), name: n, guest: true, ...(guestFrom.trim() ? { fromTeam: guestFrom.trim() } : {}), ...(guestGrade ? { grade: guestGrade } : {}) },
    ]);
    setGuestName("");
  };

  const count = list.filter((p) => selected.has(p.id)).length + guests.length;

  const save = () => {
    const chosen = list.filter((p) => selected.has(p.id));
    // 卒団・退団した元メンバーは、過去の成績のためにチームに残しておく
    // 外した他チームの選手も、試合に出ていれば成績の名前のために残す（退団扱い）
    const removedGuests = (team?.players ?? []).filter((p) => p.guest && !p.left && !guests.some((g) => g.id === p.id)).map((p) => ({ ...p, left: true }));
    const former = [...(team?.players ?? []).filter((p) => !isActive(p) && !(p.guest && !p.left)), ...removedGuests];
    onSave({
      ...(team ?? { id: newId(), createdAt: Date.now() }),
      name: name.trim(),
      maxGrade,
      players: [...chosen, ...guests, ...former],
      updatedAt: Date.now(),
    } as TeamProfile);
  };

  return (
    <section className="panel form">
      <h2>{creating ? "チームを作る" : "メンバーを選び直す"}</h2>
      <label className="field">
        チーム名
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：フェニックス 4年生" />
      </label>

      <div className="field">
        チームの学年
        <div className="segmented grade-seg">
          {[...GRADES].reverse().map((g) => (
            <button key={g} className={maxGrade === g ? "seg on" : "seg"} onClick={() => changeGrade(g)}>
              {g}年生
            </button>
          ))}
        </div>
        <span className="muted small">名簿から、今いる{teamGradeLabel(maxGrade)}の選手を並べます。</span>
      </div>

      {list.length === 0 ? (
        <div className="notice">
          <p>名簿に{teamGradeLabel(maxGrade)}の選手がいません。先に名簿へ選手を入れてください。</p>
          <button className="secondary-button" onClick={onOpenRoster}>
            名簿を開く
          </button>
        </div>
      ) : (
        <div className="field">
          <div className="member-head">
            <span>
              選手（{count - guests.length}人を選択中{guests.length ? `＋他チーム${guests.length}人` : ""}）
            </span>
            <span className="member-quick">
              <button className="link-button" onClick={() => setMany(list.map((p) => p.id), true)}>
                全員
              </button>
              <button className="link-button" onClick={() => setSelected(new Set(list.filter((p) => p.grade === maxGrade).map((p) => p.id)))}>
                {maxGrade}年生だけ
              </button>
              <button className="link-button" onClick={() => setMany(list.map((p) => p.id), false)}>
                全員外す
              </button>
            </span>
          </div>
          {groups.map(([g, players]) => (
            <div key={g ?? "none"} className="member-group">
              <h3>
                {gradeLabel(g)}
                {g !== undefined && g > maxGrade && <small>（チームの学年より上）</small>}
              </h3>
              <div className="member-chips">
                {players.map((p) => (
                  <label key={p.id} className={selected.has(p.id) ? "check-chip on" : "check-chip"}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="muted small">
            名簿にいない選手は
            <button className="link-button inline" onClick={onOpenRoster}>
              名簿
            </button>
            で追加してください。背番号は試合を作るときに入れます。
          </p>
        </div>
      )}

      <div className="field guest-section">
        他チームの選手（合同チーム）
        <span className="muted small">名簿には入れず、このチームだけで使います。合同チームで一緒に出る選手を入れてください。</span>
        {guests.length > 0 && (
          <ul className="roster-list">
            {guests.map((g) => (
              <li key={g.id}>
                <span className="roster-name">
                  {g.name}
                  <small>
                    {g.fromTeam ?? "所属未入力"}
                    {g.grade ? `・${g.grade}年` : ""}
                  </small>
                </span>
                <button className="link-button danger" onClick={() => setGuests((gs) => gs.filter((x) => x.id !== g.id))}>
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="guest-add">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) addGuest();
            }}
            placeholder="名前"
            aria-label="他チームの選手の名前"
          />
          <input value={guestFrom} onChange={(e) => setGuestFrom(e.target.value)} placeholder="所属チーム（例：みどりジュニア）" aria-label="他チームの選手の所属チーム" />
          <select value={guestGrade} onChange={(e) => setGuestGrade(e.target.value ? Number(e.target.value) : "")} aria-label="他チームの選手の学年">
            <option value="">学年（任意）</option>
            {[...GRADES].reverse().map((g) => (
              <option key={g} value={g}>
                {g}年生
              </option>
            ))}
          </select>
          <button className="secondary-button" disabled={!guestName.trim()} onClick={addGuest}>
            ＋ 追加
          </button>
        </div>
      </div>

      <div className="stack">
        <button className="primary-button" disabled={!name.trim() || count === 0} onClick={save}>
          {creating ? `${count}人でチームを作る` : "保存する"}
        </button>
        <button className="secondary-button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </section>
  );
}
