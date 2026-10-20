import { useState, type ReactNode } from "react";
import { other, type GameState } from "../domain/engine";
import type { NameOf } from "../domain/describe";
import { newId } from "../domain/id";
import { POSITION_LABELS, POSITIONS, positionProblems } from "../domain/positions";
import type { EndPlay, Game, Player, Position, Side, SubstitutionPlay } from "../domain/types";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

const NEW = "__new__";

/** 控え選手から選ぶか、新しい名前を入力する */
type Choice = { id: string; newName: string };

function benchOf(game: Game, state: GameState, side: Side): Player[] {
  return game.teams[side].roster.filter((p) => !state.lineups[side].includes(p.id));
}

function PlayerPicker({
  bench,
  value,
  onChange,
  nameOf,
  allowNone,
  label,
}: {
  bench: Player[];
  value: Choice;
  onChange: (c: Choice) => void;
  nameOf: NameOf;
  allowNone?: boolean;
  label: string;
}) {
  return (
    <div className="picker">
      <select aria-label={label} value={value.id} onChange={(e) => onChange({ ...value, id: e.target.value })}>
        {allowNone && <option value="">交代しない</option>}
        {bench.map((p) => (
          <option key={p.id} value={p.id}>
            {p.number ? `#${p.number} ` : ""}{nameOf(p.id)}（控え）
          </option>
        ))}
        <option value={NEW}>新しい選手を入力…</option>
      </select>
      {value.id === NEW && (
        <input value={value.newName} onChange={(e) => onChange({ ...value, newName: e.target.value })} placeholder="名前" aria-label={`${label}の名前`} />
      )}
    </div>
  );
}

/** Choice を選手IDにする。新しい選手なら作って newPlayers に入れる */
function resolve(choice: Choice, newPlayers: Player[]): string | null {
  if (choice.id === NEW) {
    const name = choice.newName.trim();
    if (!name) return null;
    const p = { id: newId(), name };
    newPlayers.push(p);
    return p.id;
  }
  return choice.id || null;
}

export type SubSave = (plays: SubstitutionPlay[], side: Side, newPlayers: Player[]) => void;

export function PinchDialog({
  kind,
  game,
  state,
  nameOf,
  onClose,
  onSave,
}: {
  kind: "pinch_hitter" | "pinch_runner";
  game: Game;
  state: GameState;
  nameOf: NameOf;
  onClose: () => void;
  onSave: SubSave;
}) {
  const side = state.offense;
  const bench = benchOf(game, state, side);
  const occupied = ([1, 2, 3] as const).filter((b) => state.bases[b - 1]);
  const [base, setBase] = useState<1 | 2 | 3>(occupied[0] ?? 1);
  const [outId, setOutId] = useState(state.currentBatterId ?? "");
  const [choice, setChoice] = useState<Choice>({ id: bench[0]?.id ?? NEW, newName: "" });

  const out = kind === "pinch_hitter" ? outId : state.bases[base - 1];
  const canSave = !!out && (choice.id !== NEW || choice.newName.trim() !== "");

  return (
    <Sheet title={kind === "pinch_hitter" ? "代打" : "代走"} onClose={onClose}>
      <p className="help">
        {game.teams[side].name}の選手交代です。新しい選手は打順の枠を引き継ぎます。守備位置は、守備につくときに「守備交代」で決めてください。
      </p>
      {kind === "pinch_hitter" ? (
        <label className="field">
          交代される選手
          <select value={outId} onChange={(e) => setOutId(e.target.value)}>
            {state.lineups[side].map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="field">
          どの塁のランナーと交代？
          <div className="segmented">
            {occupied.map((b) => (
              <button key={b} className={base === b ? "seg on" : "seg"} onClick={() => setBase(b)}>
                {b}塁：{nameOf(state.bases[b - 1])}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        新しく出る選手
        <PlayerPicker bench={bench} value={choice} onChange={setChoice} nameOf={nameOf} label="新しく出る選手" />
      </div>
      <div className="sheet-actions">
        <button
          className="primary-button"
          disabled={!canSave}
          onClick={() => {
            const newPlayers: Player[] = [];
            const inId = resolve(choice, newPlayers);
            if (!inId || !out) return;
            onSave(
              [
                {
                  id: newId(),
                  type: "sub",
                  side,
                  kind,
                  outPlayerId: out,
                  inPlayerId: inId,
                  base: kind === "pinch_runner" ? base : undefined,
                  createdAt: Date.now(),
                },
              ],
              side,
              newPlayers,
            );
          }}
        >
          交代を記録する
        </button>
      </div>
    </Sheet>
  );
}

type SlotEdit = { position: Position | null; replace: Choice };

/** 守備交代・ピッチャー交代・守備位置の変更をまとめて行う */
export function DefenseDialog({
  game,
  state,
  nameOf,
  onClose,
  onSave,
}: {
  game: Game;
  state: GameState;
  nameOf: NameOf;
  onClose: () => void;
  onSave: SubSave;
}) {
  const [side, setSide] = useState<Side>(other(state.offense));
  const initial = (s: Side): SlotEdit[] => state.positions[s].map((position) => ({ position, replace: { id: "", newName: "" } }));
  const [slots, setSlots] = useState<SlotEdit[]>(() => initial(other(state.offense)));
  const bench = benchOf(game, state, side);
  const lineup = state.lineups[side];

  const switchSide = (s: Side) => {
    setSide(s);
    setSlots(initial(s));
  };
  const edit = (i: number, patch: Partial<SlotEdit>) => setSlots((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const problems = positionProblems(slots.map((s) => s.position));
  const blocking = problems.filter((p) => !p.startsWith("ピッチャーがいません"));
  const usedBench = slots.map((s) => s.replace.id).filter((id) => id && id !== NEW);
  const duplicateBench = new Set(usedBench).size !== usedBench.length;
  const missingName = slots.some((s) => s.replace.id === NEW && !s.replace.newName.trim());
  const changed = slots.some((s, i) => s.replace.id || s.position !== state.positions[side][i]);

  const save = () => {
    const newPlayers: Player[] = [];
    const subs: SubstitutionPlay[] = [];
    const moves: SubstitutionPlay[] = [];
    slots.forEach((slot, i) => {
      const inId = resolve(slot.replace, newPlayers);
      if (inId) {
        subs.push({ id: newId(), type: "sub", side, kind: "defense", outPlayerId: lineup[i], inPlayerId: inId, position: slot.position, createdAt: Date.now() });
      } else if (slot.position !== state.positions[side][i]) {
        moves.push({ id: newId(), type: "sub", side, kind: "position", inPlayerId: lineup[i], position: slot.position, createdAt: Date.now() });
      }
    });
    onSave([...subs, ...moves], side, newPlayers);
  };

  return (
    <Sheet title="守備交代・ピッチャー交代" onClose={onClose}>
      <p className="help">
        交代する選手の「交代」で新しい選手を選び、守備位置を直して保存します。ピッチャー交代は、ピッチャーの行で交代する選手を選ぶか、野手の守備位置を「ピッチャー」に変えてください。
      </p>
      <div className="segmented">
        {(["away", "home"] as const).map((s) => (
          <button key={s} className={side === s ? "seg on" : "seg"} onClick={() => switchSide(s)}>
            {game.teams[s].name}
            {s !== state.offense ? "（守備中）" : ""}
          </button>
        ))}
      </div>
      <ol className="defense-rows">
        {lineup.map((id, i) => (
          <li key={id} className="runner-row">
            <div className="runner-name">
              <span>{i + 1}番</span>
              <strong>{nameOf(id)}</strong>
              {state.positions[side][i] === null && <span className="review-badge">守備位置なし</span>}
            </div>
            <div className="defense-grid">
              <label>
                <span>守備位置</span>
                <select
                  value={slots[i]?.position ?? ""}
                  onChange={(e) => edit(i, { position: e.target.value ? (Number(e.target.value) as Position) : null })}
                >
                  <option value="">守備なし</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>交代</span>
                <PlayerPicker
                  bench={bench}
                  value={slots[i]?.replace ?? { id: "", newName: "" }}
                  onChange={(c) => edit(i, { replace: c })}
                  nameOf={nameOf}
                  allowNone
                  label={`${i + 1}番の交代`}
                />
              </label>
            </div>
          </li>
        ))}
      </ol>
      {problems.map((p) => (
        <p key={p} className={blocking.includes(p) ? "error" : "warning"}>
          {blocking.includes(p) ? "✕" : "⚠"} {p}
        </p>
      ))}
      {duplicateBench && <p className="error">✕ 同じ控え選手を2つの枠に選んでいます</p>}
      <div className="sheet-actions">
        <button className="primary-button" disabled={!changed || blocking.length > 0 || duplicateBench || missingName} onClick={save}>
          交代を記録する
        </button>
      </div>
    </Sheet>
  );
}

export function EndGameDialog({ onClose, onSave }: { onClose: () => void; onSave: (reason: EndPlay["reason"], note?: string) => void }) {
  const [reason, setReason] = useState<EndPlay["reason"]>("called");
  const [note, setNote] = useState("");
  return (
    <Sheet title="試合を終了する" onClose={onClose}>
      <p className="help">
        予定の回の終了やサヨナラは自動で試合終了になります。コールドゲームや時間切れのときだけ使ってください。
        <br />
        ※イニング途中で終了した場合の得点の扱い（その回を無効にするか）は大会規定によるため、自動では判断しません。
      </p>
      <div className="segmented">
        {(
          [
            ["called", "コールド"],
            ["time", "時間切れ"],
            ["other", "その他"],
          ] as const
        ).map(([r, label]) => (
          <button key={r} className={reason === r ? "seg on" : "seg"} onClick={() => setReason(r)}>
            {label}
          </button>
        ))}
      </div>
      <label className="field">
        メモ（任意）
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：5回10点差コールド" />
      </label>
      <div className="sheet-actions">
        <button className="primary-button" onClick={() => onSave(reason, note.trim() || undefined)}>
          試合終了にする
        </button>
      </div>
    </Sheet>
  );
}
