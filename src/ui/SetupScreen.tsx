import { useState } from "react";
import { CATEGORIES, eligiblePlayers, gradeLabel } from "../domain/categories";
import { categoryForGrade } from "../domain/roster";
import { moveItem, useDragReorder } from "./useDragReorder";
import { newId } from "../domain/id";
import { DEFAULT_PITCH_LIMIT } from "../domain/pitchCount";
import { POSITION_LABELS, POSITION_SHORT, POSITIONS, positionProblems } from "../domain/positions";
import type { Game, Player, Position, Side, Team, TeamProfile } from "../domain/types";

/** その場で入力するチーム（相手チームなど） */
type ManualRow = { name: string; position: Position | null };
type ManualForm = { kind: "manual"; name: string; rows: ManualRow[]; bench: string };

/** 登録チーム：打順は名簿から選び、背番号は試合ごとに入れる。控えは背番号を入れた選手だけが出場する */
type ProfileRow = { playerId: string; number: string; position: Position | null };
type ProfileForm = { kind: "profile"; teamId: string; rows: ProfileRow[]; benchNumbers: Record<string, string> };

type TeamForm = ManualForm | ProfileForm;

const SAMPLE_POSITIONS: Position[] = [8, 4, 6, 1, 2, 3, 5, 7, 9];

const SAMPLE: Record<Side, ManualForm> = {
  away: {
    kind: "manual",
    name: "さいたまフェニックス",
    rows: ["山田", "佐藤", "鈴木", "田中", "高橋", "伊藤", "渡辺", "中村", "小林"].map((name, i) => ({ name, position: SAMPLE_POSITIONS[i] })),
    bench: "加藤\n吉田",
  },
  home: {
    kind: "manual",
    name: "○○ジュニア",
    rows: Array.from({ length: 9 }, (_, i) => ({ name: `選手${i + 1}`, position: SAMPLE_POSITIONS[i] })),
    bench: "",
  },
};

export function teamLabel(t: TeamProfile) {
  return t.name || "（名前のないチーム）";
}

function profileForm(t: TeamProfile, category: string, includeLower: boolean): ProfileForm {
  const eligible = eligiblePlayers(t.players, category, includeLower);
  const ok = (id: string) => eligible.some((p) => p.id === id);
  const last = (t.lastLineups?.[category] ?? []).filter((r) => ok(r.playerId));
  const numberOf = (id: string) => t.lastNumbers?.[id] ?? "";
  const rows: ProfileRow[] = last.length
    ? last.map((r) => ({ playerId: r.playerId, number: numberOf(r.playerId), position: r.position }))
    : eligible.slice(0, 9).map((p, i) => ({ playerId: p.id, number: numberOf(p.id), position: SAMPLE_POSITIONS[i] ?? null }));
  const benchNumbers: Record<string, string> = {};
  for (const p of eligible) if (!rows.some((r) => r.playerId === p.id)) benchNumbers[p.id] = numberOf(p.id);
  return { kind: "profile", teamId: t.id, rows, benchNumbers };
}

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

function startersOf(form: TeamForm) {
  return form.kind === "profile" ? form.rows.filter((r) => r.playerId) : form.rows.filter((r) => r.name.trim());
}

function toTeam(form: TeamForm, profiles: TeamProfile[]): Team {
  if (form.kind === "profile") {
    const profile = profiles.find((t) => t.id === form.teamId)!;
    const byId = new Map(profile.players.map((p) => [p.id, p]));
    const rows = startersOf(form) as ProfileRow[];
    const starters: Player[] = rows.map((r) => ({ id: r.playerId, name: byId.get(r.playerId)?.name ?? "", number: r.number.trim() || undefined }));
    const bench: Player[] = Object.entries(form.benchNumbers)
      .filter(([id, n]) => n.trim() && !rows.some((r) => r.playerId === id) && byId.has(id))
      .map(([id, n]) => ({ id, name: byId.get(id)!.name, number: n.trim() }));
    return { id: profile.id, name: profile.name, roster: [...starters, ...bench], lineup: rows.map((r) => r.playerId), positions: rows.map((r) => r.position) };
  }
  const rows = startersOf(form) as ManualRow[];
  const starters = rows.map((r) => ({ id: newId(), name: r.name.trim() }));
  const bench = lines(form.bench).map((name) => ({ id: newId(), name }));
  return { id: newId(), name: form.name.trim(), roster: [...starters, ...bench], lineup: starters.map((p) => p.id), positions: rows.map((r) => r.position) };
}

type Props = {
  profiles: TeamProfile[];
  /** 登録チームの画面から来たときは、そのチームを先攻にセットしておく */
  initialTeamId?: string;
  onCreate: (game: Game) => void;
  onCancel?: () => void;
};

export function SetupScreen({ profiles, initialTeamId, onCreate, onCancel }: Props) {
  const initialProfile = profiles.find((t) => t.id === initialTeamId) ?? (profiles.length === 1 ? profiles[0] : undefined);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [season, setSeason] = useState(() => new Date().getFullYear().toString());
  // チームの学年（4年生以下のチームなら「4年生」）を最初のカテゴリーにする
  const initialCategory = categoryForGrade(initialProfile?.maxGrade) ?? "6年生";
  const [category, setCategory] = useState(initialCategory);
  const [includeLower, setIncludeLower] = useState(false);
  const [tournament, setTournament] = useState("");
  const [innings, setInnings] = useState(7);
  const [pitchLimit, setPitchLimit] = useState(DEFAULT_PITCH_LIMIT);
  const [teams, setTeams] = useState<Record<Side, TeamForm>>(() =>
    initialProfile ? { away: profileForm(initialProfile, initialCategory, false), home: { ...SAMPLE.home } } : SAMPLE,
  );

  const profileOf = (form: TeamForm) => (form.kind === "profile" ? profiles.find((t) => t.id === form.teamId) : undefined);
  const update = (side: Side, form: TeamForm) => setTeams((t) => ({ ...t, [side]: form }));

  // カテゴリーを変えたら、登録チームの打順と控えを作り直す
  const changeCategory = (cat: string, lower = includeLower) => {
    setCategory(cat);
    setIncludeLower(lower);
    setTeams((t) => {
      const next = { ...t };
      for (const side of ["away", "home"] as const) {
        const p = profileOf(t[side]);
        if (p) next[side] = profileForm(p, cat, lower);
      }
      return next;
    });
  };

  const chooseTeam = (side: Side, id: string) => {
    const t = profiles.find((p) => p.id === id);
    update(side, t ? profileForm(t, category, includeLower) : { ...SAMPLE[side], name: "" });
  };

  const problems: string[] = [];
  const warnings: string[] = [];
  for (const side of ["away", "home"] as const) {
    const label = side === "away" ? "先攻" : "後攻";
    const form = teams[side];
    if (form.kind === "manual" && !form.name.trim()) problems.push(`${label}チームの名前を入力してください`);
    const rows = startersOf(form);
    if (rows.length === 0) problems.push(`${label}チームの選手を1人以上入れてください`);
    for (const p of positionProblems(rows.map((r) => r.position))) {
      (p.startsWith("ピッチャーがいません") ? warnings : problems).push(`${label}：${p}`);
    }
    if (form.kind === "profile") {
      const ids = form.rows.map((r) => r.playerId).filter(Boolean);
      if (new Set(ids).size !== ids.length) problems.push(`${label}：同じ選手が打順に2回入っています`);
      const numbers = [
        ...form.rows.filter((r) => r.playerId).map((r) => r.number.trim()),
        ...Object.entries(form.benchNumbers)
          .filter(([id]) => !ids.includes(id))
          .map(([, n]) => n.trim()),
      ].filter(Boolean);
      const dup = numbers.filter((n, i) => numbers.indexOf(n) !== i);
      if (dup.length) problems.push(`${label}：背番号 ${[...new Set(dup)].join("、")} が重複しています`);
      if (form.rows.some((r) => r.playerId && !r.number.trim())) warnings.push(`${label}：背番号が入っていない先発選手がいます`);
    }
  }
  if (teams.away.kind === "profile" && teams.home.kind === "profile" && teams.away.teamId === teams.home.teamId)
    problems.push("先攻と後攻に同じ登録チームは選べません");

  const usesProfile = teams.away.kind === "profile" || teams.home.kind === "profile";

  const start = () => {
    const now = Date.now();
    onCreate({
      id: newId(),
      version: 2,
      season: season.trim() || undefined,
      category: usesProfile ? category : undefined,
      date,
      tournament: tournament.trim(),
      scheduledInnings: innings,
      pitchLimit,
      teams: { away: toTeam(teams.away, profiles), home: toTeam(teams.home, profiles) },
      plays: [],
      createdAt: now,
      updatedAt: now,
    });
  };

  return (
    <main className="app">
      <header className="header">
        <div>
          <p className="eyebrow">NEW GAME</p>
          <h1>試合を作成</h1>
        </div>
        {onCancel && (
          <button className="secondary-button" onClick={onCancel}>
            戻る
          </button>
        )}
      </header>

      <section className="panel form">
        {profiles.length > 0 && (
          <div className="field">
            カテゴリー
            <div className="segmented">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={category === c.id ? "seg on" : "seg"} onClick={() => changeCategory(c.id)}>
                  {c.id}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={includeLower} onChange={(e) => changeCategory(category, e.target.checked)} />
              下の学年の選手も選べるようにする
            </label>
          </div>
        )}
        <div className="two-col">
          <label className="field">
            試合日
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            シーズン
            <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="例：2026" inputMode="numeric" />
          </label>
        </div>
        <label className="field">
          大会名（任意）
          <input value={tournament} onChange={(e) => setTournament(e.target.value)} placeholder="例：市民大会 1回戦" />
        </label>
        <div className="two-col">
          <label className="field">
            予定のイニング数
            <select value={innings} onChange={(e) => setInnings(Number(e.target.value))}>
              {[3, 4, 5, 6, 7, 9].map((n) => (
                <option key={n} value={n}>
                  {n}回
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            投手の球数制限（1日）
            <select value={pitchLimit} onChange={(e) => setPitchLimit(Number(e.target.value))}>
              {[0, 50, 60, 70, 80, 85, 100].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "制限なし" : `${n}球`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <small className="muted">球数は同じ日のほかの試合で投げた分も合算し、制限の10球前から注意を出します。大会の規定に合わせてください。</small>
      </section>

      <div className="team-forms">
        {(["away", "home"] as const).map((side) => {
          const form = teams[side];
          const profile = profileOf(form);
          return (
            <section key={side} className="panel form">
              <h2>{side === "away" ? "先攻（表に攻撃）" : "後攻（裏に攻撃）"}</h2>
              <label className="field">
                チーム
                <select value={form.kind === "profile" ? form.teamId : ""} onChange={(e) => chooseTeam(side, e.target.value)}>
                  <option value="">その場で入力する（相手チームなど）</option>
                  {profiles.map((t) => (
                    <option key={t.id} value={t.id}>
                      {teamLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              {form.kind === "profile" && profile ? (
                <ProfileLineup form={form} profile={profile} category={category} includeLower={includeLower} onChange={(f) => update(side, f)} />
              ) : form.kind === "manual" ? (
                <ManualLineup form={form} onChange={(f) => update(side, f)} />
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="team-actions">
        <button className="secondary-button" onClick={() => setTeams((t) => ({ away: t.home, home: t.away }))}>
          先攻と後攻を入れ替える
        </button>
      </div>

      {problems.map((p) => (
        <p key={p} className="error">
          {p}
        </p>
      ))}
      {warnings.map((p) => (
        <p key={p} className="warning">
          ⚠ {p}
        </p>
      ))}
      <button className="primary-button big" disabled={problems.length > 0} onClick={start}>
        試合開始
      </button>
    </main>
  );
}

function PositionSelect({ value, onChange, label, short }: { value: Position | null; onChange: (p: Position | null) => void; label: string; short?: boolean }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? (Number(e.target.value) as Position) : null)} aria-label={label}>
      <option value="">{short ? "なし" : "守備なし"}</option>
      {POSITIONS.map((p) => (
        <option key={p} value={p}>
          {short ? `${p} ${POSITION_SHORT[p]}` : POSITION_LABELS[p]}
        </option>
      ))}
    </select>
  );
}

function ProfileLineup({
  form,
  profile,
  category,
  includeLower,
  onChange,
}: {
  form: ProfileForm;
  profile: TeamProfile;
  category: string;
  includeLower: boolean;
  onChange: (f: ProfileForm) => void;
}) {
  const eligible = eligiblePlayers(profile.players, category, includeLower);
  const used = new Set(form.rows.map((r) => r.playerId).filter(Boolean));
  const bench = eligible.filter((p) => !used.has(p.id));
  const editRow = (i: number, patch: Partial<ProfileRow>) => {
    const rows = form.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    // 打順から外れた選手は控えの欄に戻す（背番号は引き継ぐ）
    const benchNumbers = { ...form.benchNumbers };
    const old = form.rows[i];
    if (patch.playerId !== undefined && old.playerId && old.playerId !== patch.playerId) benchNumbers[old.playerId] = old.number;
    const picked = patch.playerId ? (form.benchNumbers[patch.playerId] ?? profile.lastNumbers?.[patch.playerId] ?? "") : undefined;
    if (picked !== undefined && patch.number === undefined) rows[i] = { ...rows[i], number: picked };
    onChange({ ...form, rows, benchNumbers });
  };

  const drag = useDragReorder<HTMLOListElement>((from, to) => onChange({ ...form, rows: moveItem(form.rows, from, to) }));

  if (eligible.length === 0) {
    return <p className="notice">{category}の選手が名簿にいません。名簿で選手の学年を確認するか、「下の学年の選手も選べるようにする」を使ってください。</p>;
  }

  return (
    <>
      <div className="field">
        先発（打順・背番号・守備位置）
        <span className="muted small">打順を変えるときは、番号の「⋮⋮」を指で押したまま上下に動かします。</span>
        <ol className="lineup-rows with-number" ref={drag.listRef}>
          {form.rows.map((r, i) => (
            <li key={i} className={drag.dragging === i ? "dragging" : undefined}>
              <OrderHandle index={i} {...drag.handleProps(i)} />
              <select value={r.playerId} onChange={(e) => editRow(i, { playerId: e.target.value })} aria-label={`${i + 1}番の選手`}>
                <option value="">選手を選ぶ</option>
                {eligible
                  .filter((p) => p.id === r.playerId || !used.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.guest ? `${p.name}（他チーム${p.fromTeam ? `・${p.fromTeam}` : ""}）` : `${p.name}（${gradeLabel(p.grade)}）`}
                    </option>
                  ))}
              </select>
              <input
                className="number-input"
                value={r.number}
                onChange={(e) => editRow(i, { number: e.target.value })}
                placeholder="背番号"
                inputMode="numeric"
                aria-label={`${i + 1}番の背番号`}
              />
              <PositionSelect short value={r.position} onChange={(position) => editRow(i, { position })} label={`${i + 1}番の守備位置`} />
              <button
                className="icon-button"
                aria-label={`${i + 1}番を削除`}
                onClick={() => {
                  const benchNumbers = r.playerId ? { ...form.benchNumbers, [r.playerId]: r.number } : form.benchNumbers;
                  onChange({ ...form, rows: form.rows.filter((_, j) => j !== i), benchNumbers });
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
        <button className="secondary-button" onClick={() => onChange({ ...form, rows: [...form.rows, { playerId: "", number: "", position: null }] })}>
          ＋ 打者を追加
        </button>
      </div>

      <div className="field">
        控え選手（背番号を入れた選手が、この試合の控えになります）
        {bench.length === 0 ? (
          <p className="muted small">控えにできる選手はいません。</p>
        ) : (
          <ul className="bench-rows">
            {bench.map((p) => {
              const n = form.benchNumbers[p.id] ?? "";
              return (
                <li key={p.id} className={n.trim() ? "" : "off"}>
                  <span>
                    {p.name}
                    <small>{p.guest ? `他チーム${p.fromTeam ? `・${p.fromTeam}` : ""}` : gradeLabel(p.grade)}</small>
                  </span>
                  <input
                    className="number-input"
                    value={n}
                    onChange={(e) => onChange({ ...form, benchNumbers: { ...form.benchNumbers, [p.id]: e.target.value } })}
                    placeholder="背番号"
                    inputMode="numeric"
                    aria-label={`${p.name}の背番号`}
                  />
                  <span className="bench-state">{n.trim() ? "控え" : "出場しない"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/** 打順の番号。押したまま上下に動かすと打順を入れ替えられる */
function OrderHandle({ index, ...handlers }: { index: number } & ReturnType<ReturnType<typeof useDragReorder>["handleProps"]>) {
  return (
    <span className="order drag-handle" role="button" aria-label={`${index + 1}番：押したまま上下に動かして打順を入れ替え`} {...handlers}>
      <span className="grip" aria-hidden="true">
        ⋮⋮
      </span>
      {index + 1}
    </span>
  );
}

function ManualLineup({ form, onChange }: { form: ManualForm; onChange: (f: ManualForm) => void }) {
  const drag = useDragReorder<HTMLOListElement>((from, to) => onChange({ ...form, rows: moveItem(form.rows, from, to) }));
  const editRow = (i: number, patch: Partial<ManualRow>) => onChange({ ...form, rows: form.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <>
      <label className="field">
        チーム名
        <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} />
      </label>
      <div className="field">
        打順と守備位置
        <span className="muted small">打順を変えるときは、番号の「⋮⋮」を指で押したまま上下に動かします。</span>
        <ol className="lineup-rows" ref={drag.listRef}>
          {form.rows.map((r, i) => (
            <li key={i} className={drag.dragging === i ? "dragging" : undefined}>
              <OrderHandle index={i} {...drag.handleProps(i)} />
              <input value={r.name} onChange={(e) => editRow(i, { name: e.target.value })} placeholder="名前" aria-label={`${i + 1}番の名前`} />
              <PositionSelect value={r.position} onChange={(position) => editRow(i, { position })} label={`${i + 1}番の守備位置`} />
              <button className="icon-button" aria-label={`${i + 1}番を削除`} onClick={() => onChange({ ...form, rows: form.rows.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </li>
          ))}
        </ol>
        <button className="secondary-button" onClick={() => onChange({ ...form, rows: [...form.rows, { name: "", position: null }] })}>
          ＋ 打者を追加
        </button>
      </div>
      <label className="field">
        控え選手（1行に1人・任意）
        <textarea rows={3} value={form.bench} onChange={(e) => onChange({ ...form, bench: e.target.value })} placeholder="途中から出る選手" />
      </label>
    </>
  );
}
