import { useState } from "react";
import { CATEGORIES, eligiblePlayers, gradeLabel } from "../domain/categories";
import { categoryForGrade } from "../domain/roster";
import { moveItem, useDragReorder } from "./useDragReorder";
import { newId } from "../domain/id";
import { DEFAULT_PITCH_LIMIT } from "../domain/pitchCount";
import { defaultTimeLimit, TIME_LIMIT_OPTIONS } from "../domain/gameClock";
import { POSITION_SHORT, POSITIONS, positionProblems } from "../domain/positions";
import type { Game, Player, Position, Side, Team, TeamProfile } from "../domain/types";

/** その場で入力するチーム（相手チームなど） */
/** position が null の打者は指名打者（指）。bench の行は控え選手（打順に入らない）。dhPitcher は打順に入らないピッチャー */
type ManualRow = { name: string; position: Position | null; bench?: boolean; dhPitcher?: boolean };
type ManualForm = { kind: "manual"; name: string; rows: ManualRow[] };

/** 登録チーム：打順は名簿から選び、背番号は試合ごとに入れる。控えは背番号を入れた選手だけが出場する */
type ProfileRow = { playerId: string; number: string; position: Position | null };
type ProfileForm = { kind: "profile"; teamId: string; rows: ProfileRow[]; benchNumbers: Record<string, string>; pitcherId?: string };

type TeamForm = ManualForm | ProfileForm;

const SAMPLE_POSITIONS: Position[] = [8, 4, 6, 1, 2, 3, 5, 7, 9];

/** その場で入力するチームの最初の形：名前は空欄、9人分の行 */
const blankManual = (): ManualForm => ({
  kind: "manual",
  name: "",
  rows: SAMPLE_POSITIONS.map((position) => ({ name: "", position })),
});

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

function startersOf(form: TeamForm) {
  return form.kind === "profile" ? form.rows.filter((r) => r.playerId) : form.rows.filter((r) => !r.bench && r.name.trim());
}

/** 打順に入らないピッチャー（DH制）。打順の中にピッチャーがいるときは使わない */
function dhPitcherOf(form: TeamForm): string | null {
  if (startersOf(form).some((r) => r.position === 1)) return null;
  if (form.kind === "profile") return form.pitcherId || null;
  return form.rows.find((r) => r.bench && r.dhPitcher && r.name.trim())?.name.trim() ?? null;
}

function toTeam(form: TeamForm, profiles: TeamProfile[]): Team {
  if (form.kind === "profile") {
    const profile = profiles.find((t) => t.id === form.teamId)!;
    const byId = new Map(profile.players.map((p) => [p.id, p]));
    const rows = startersOf(form) as ProfileRow[];
    const starters: Player[] = rows.map((r) => ({ id: r.playerId, name: byId.get(r.playerId)?.name ?? "", number: r.number.trim() || undefined }));
    const bench: Player[] = Object.entries(form.benchNumbers)
      .filter(([id, n]) => (n.trim() || id === dhPitcherOf(form)) && !rows.some((r) => r.playerId === id) && byId.has(id))
      .map(([id, n]) => ({ id, name: byId.get(id)!.name, number: n.trim() || undefined }));
    return {
      id: profile.id,
      name: profile.name,
      roster: [...starters, ...bench],
      lineup: rows.map((r) => r.playerId),
      positions: rows.map((r) => r.position),
      pitcherId: dhPitcherOf(form) ?? undefined,
    };
  }
  const rows = startersOf(form) as ManualRow[];
  const starters = rows.map((r) => ({ id: newId(), name: r.name.trim() }));
  const benchRows = form.rows.filter((r) => r.bench && r.name.trim());
  const bench = benchRows.map((r) => ({ id: newId(), name: r.name.trim() }));
  const dh = dhPitcherOf(form) ? bench[benchRows.findIndex((r) => r.dhPitcher)] : undefined;
  return {
    id: newId(),
    name: form.name.trim(),
    roster: [...starters, ...bench],
    lineup: starters.map((p) => p.id),
    positions: rows.map((r) => r.position),
    pitcherId: dh?.id,
  };
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
  const [timeLimit, setTimeLimit] = useState(() => defaultTimeLimit(initialCategory));
  const [teams, setTeams] = useState<Record<Side, TeamForm>>(() =>
    initialProfile ? { away: profileForm(initialProfile, initialCategory, false), home: blankManual() } : { away: blankManual(), home: blankManual() },
  );

  const profileOf = (form: TeamForm) => (form.kind === "profile" ? profiles.find((t) => t.id === form.teamId) : undefined);
  const update = (side: Side, form: TeamForm) => setTeams((t) => ({ ...t, [side]: form }));

  // カテゴリーを変えたら、登録チームの打順と控えを作り直す
  const changeCategory = (cat: string, lower = includeLower) => {
    setCategory(cat);
    setIncludeLower(lower);
    setTimeLimit(defaultTimeLimit(cat));
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
    update(side, t ? profileForm(t, category, includeLower) : blankManual());
  };

  // 打順・守備位置まわりの注意は、その側の先発メンバーの上に出す（下までスクロールしなくて済むように）
  const sideIssues = { away: { problems: [] as string[], warnings: [] as string[] }, home: { problems: [] as string[], warnings: [] as string[] } };
  for (const side of ["away", "home"] as const) {
    const label = side === "away" ? "先攻" : "後攻";
    const form = teams[side];
    const { problems, warnings } = sideIssues[side];
    if (form.kind === "manual" && !form.name.trim()) problems.push(`${label}チームの名前を入力してください`);
    const rows = startersOf(form);
    if (rows.length === 0) problems.push(`${label}チームの選手を1人以上入れてください`);
    const positions = rows.map((r) => r.position);
    for (const p of positionProblems(dhPitcherOf(form) ? [...positions, 1] : positions)) {
      (p.startsWith("ピッチャーがいません") ? warnings : problems).push(p);
    }
    if (dhPitcherOf(form) && positions.filter((x) => x === null).length > 1) warnings.push("「指」の打者が2人以上います");
    if (form.kind === "profile") {
      const ids = form.rows.map((r) => r.playerId).filter(Boolean);
      if (new Set(ids).size !== ids.length) problems.push("同じ選手が打順に2回入っています");
      const numbers = [
        ...form.rows.filter((r) => r.playerId).map((r) => r.number.trim()),
        ...Object.entries(form.benchNumbers)
          .filter(([id]) => !ids.includes(id))
          .map(([, n]) => n.trim()),
      ].filter(Boolean);
      const dup = numbers.filter((n, i) => numbers.indexOf(n) !== i);
      if (dup.length) problems.push(`背番号 ${[...new Set(dup)].join("、")} が重複しています`);
      if (form.rows.some((r) => r.playerId && !r.number.trim())) warnings.push("背番号が入っていない先発選手がいます");
    }
  }
  const commonProblems: string[] = [];
  if (teams.away.kind === "profile" && teams.home.kind === "profile" && teams.away.teamId === teams.home.teamId)
    commonProblems.push("先攻と後攻に同じ登録チームは選べません");
  const problems = [...commonProblems, ...sideIssues.away.problems, ...sideIssues.home.problems];
  const sidesWithProblems = (["away", "home"] as const).filter((s) => sideIssues[s].problems.length > 0);

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
      timeLimit,
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
        <label className="field">
          試合時間
          <div className="segmented">
            {TIME_LIMIT_OPTIONS.map((n) => (
              <button key={n} className={timeLimit === n ? "seg on" : "seg"} onClick={() => setTimeLimit(n)}>
                {n ? `${n}分` : "なし"}
              </button>
            ))}
          </div>
        </label>
        <small className="muted">試合時間は、5・6年生は90分、4年生以下は80分を最初に選んでいます。試合画面の「プレイボール」でストップウォッチが始まります。</small>
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
              {sideIssues[side].problems.map((p) => (
                <p key={p} className="error">
                  ✕ {p}
                </p>
              ))}
              {sideIssues[side].warnings.map((p) => (
                <p key={p} className="warning">
                  ⚠ {p}
                </p>
              ))}
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

      {commonProblems.map((p) => (
        <p key={p} className="error">
          {p}
        </p>
      ))}
      {sidesWithProblems.length > 0 && (
        <p className="error">{sidesWithProblems.map((s) => (s === "away" ? "先攻" : "後攻")).join("・")}の先発メンバーに直すところがあります（上の赤い表示を見てください）</p>
      )}
      <button className="primary-button big" disabled={problems.length > 0} onClick={start}>
        試合開始
      </button>
    </main>
  );
}

/** 守備位置の選択。番号は出さず「投」「遊」「左」のような1文字で表示する。「指」は守備につかない打者（指名打者）、「控」は控え選手 */
function PositionSelect({
  value,
  onChange,
  label,
  onBench,
}: {
  value: Position | null;
  onChange: (p: Position | null) => void;
  label: string;
  onBench?: () => void;
}) {
  return (
    <select
      className="position-select"
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "bench") return onBench?.();
        onChange(e.target.value ? (Number(e.target.value) as Position) : null);
      }}
      aria-label={label}
    >
      {POSITIONS.map((p) => (
        <option key={p} value={p}>
          {POSITION_SHORT[p]}
        </option>
      ))}
      <option value="">指</option>
      {onBench && <option value="bench">控</option>}
    </select>
  );
}

/** DH制で打順に入らないピッチャーを選ぶ（打順にピッチャーがいないときだけ出す） */
function DhPitcherSelect({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field dh-pitcher">
      ピッチャー（DH制：打順に入らない）
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">選ばない</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {options.length === 0 && <span className="muted small">控え選手を追加すると、ここで選べます。</span>}
    </label>
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
              <PositionSelect value={r.position} onChange={(position) => editRow(i, { position })} label={`${i + 1}番の守備位置`} />
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
      {!form.rows.some((r) => r.playerId && r.position === 1) && (
        <DhPitcherSelect
          options={bench.map((p) => ({ value: p.id, label: p.name }))}
          value={form.pitcherId && bench.some((p) => p.id === form.pitcherId) ? form.pitcherId : ""}
          onChange={(v) => onChange({ ...form, pitcherId: v || undefined })}
        />
      )}

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
  // 控えにした選手は打順の下にまとめる
  const toBench = (i: number) => {
    const row = { ...form.rows[i], position: null, bench: true };
    onChange({ ...form, rows: [...form.rows.filter((_, j) => j !== i), row] });
  };
  const batters = form.rows.filter((r) => !r.bench);
  const benchRows = form.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.bench && r.name.trim());
  const dhIndex = form.rows.findIndex((r) => r.bench && r.dhPitcher);
  let order = 0;
  return (
    <>
      <label className="field">
        チーム名
        <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} />
      </label>
      <div className="field">
        打順と守備位置
        <span className="muted small">打順を変えるときは、番号の「⋮⋮」を指で押したまま上下に動かします。守備で「指」は指名打者、「控」は控え選手です。</span>
        <ol className="lineup-rows" ref={drag.listRef}>
          {form.rows.map((r, i) => {
            const label = r.bench ? null : ++order;
            return (
              <li key={i} className={[drag.dragging === i ? "dragging" : "", r.bench ? "bench-row" : ""].join(" ").trim() || undefined}>
                {label === null ? (
                  <span className="order bench-label">控</span>
                ) : (
                  <OrderHandle index={label - 1} {...drag.handleProps(i)} />
                )}
                <input
                  value={r.name}
                  onChange={(e) => editRow(i, { name: e.target.value })}
                  placeholder={r.bench ? "控え選手の名前" : "名前"}
                  aria-label={r.bench ? `控え選手の名前` : `${label}番の名前`}
                />
                {r.bench ? (
                  <select
                    className="position-select"
                    value="bench"
                    onChange={(e) => {
                      // 控えから打順に入れる：打順の最後に入れる
                      const v = e.target.value;
                      const row: ManualRow = { name: r.name, position: v ? (Number(v) as Position) : null };
                      const rest = form.rows.filter((_, j) => j !== i);
                      onChange({ ...form, rows: [...rest.filter((x) => !x.bench), row, ...rest.filter((x) => x.bench)] });
                    }}
                    aria-label="控え選手の守備位置"
                  >
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {POSITION_SHORT[p]}
                      </option>
                    ))}
                    <option value="">指</option>
                    <option value="bench">控</option>
                  </select>
                ) : (
                  <PositionSelect value={r.position} onChange={(position) => editRow(i, { position })} onBench={() => toBench(i)} label={`${label}番の守備位置`} />
                )}
                <button
                  className="icon-button"
                  aria-label={r.bench ? `控え選手${r.name}を削除` : `${label}番を削除`}
                  onClick={() => onChange({ ...form, rows: form.rows.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
        <button
          className="secondary-button"
          onClick={() => onChange({ ...form, rows: [...batters, { name: "", position: null }, ...form.rows.filter((r) => r.bench)] })}
        >
          ＋ 打者・控え選手を追加
        </button>
        <span className="muted small">控え選手は、追加した行の守備で「控」を選びます。</span>
      </div>
      {!batters.some((r) => r.name.trim() && r.position === 1) && (
        <DhPitcherSelect
          options={benchRows.map(({ r, i }) => ({ value: String(i), label: r.name.trim() }))}
          value={dhIndex >= 0 && form.rows[dhIndex].name.trim() ? String(dhIndex) : ""}
          onChange={(v) => onChange({ ...form, rows: form.rows.map((r, j) => ({ ...r, dhPitcher: r.bench && String(j) === v })) })}
        />
      )}
    </>
  );
}
