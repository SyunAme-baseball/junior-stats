// データモデル。正本は Game.plays（プレー履歴）のみ。
// 得点・走者・アウト・打順・個人成績はすべて engine.ts の replay() で再計算する。

export type Side = "away" | "home"; // away = ビジター（表に攻撃）, home = ホーム（裏に攻撃）
export type Half = "top" | "bottom";

export type Player = {
  id: string;
  name: string;
  /** 背番号。試合ごとに決めるので、試合データ（Team.roster）の中でだけ使う */
  number?: string;
  /** 学年（1〜6）。7 は卒団。名簿・チームでだけ使う */
  grade?: number;
  /** 退団した選手。名簿やチームの選手選びには出さないが、過去の成績のために残す */
  left?: boolean;
};

export type LineupSlot = { playerId: string; position: Position | null };

/**
 * 登録チーム。選手は名簿（クラブ全体で1つ）から選び、名前と学年は名簿のものを使う。
 * 試合ごとにカテゴリー（6年生など）で絞り込む。
 * 試合で使った選手IDをそのまま使うので、同じチームの試合を合計して通算成績を出せる。
 */
export type TeamProfile = {
  id: string;
  name: string;
  players: Player[];
  /** チームの学年（例：4 = 4年生以下のチーム）。作るときに名簿から選手を並べるのに使う */
  maxGrade?: number;
  /** カテゴリーごとの前回の打順と守備位置（次の試合の初期値） */
  lastLineups?: Record<string, LineupSlot[]>;
  /** 選手ごとの前回の背番号（次の試合の初期値） */
  lastNumbers?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  /** 旧形式（シーズン×学年ごとのチーム）の名残。読み込み時に移行する */
  season?: string;
  grade?: string;
  lastLineup?: LineupSlot[];
};

/** 守備位置（公式記録の番号）：1投 2捕 3一 4二 5三 6遊 7左 8中 9右 */
export type Position = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Team = {
  id: string;
  name: string;
  /** 登録選手（控え・途中出場の選手も含む） */
  roster: Player[];
  /** 試合開始時の打順（選手IDの並び）。交代は Play(type="sub") で表現する */
  lineup: string[];
  /** 試合開始時の守備位置（lineup と同じ並び）。null は守備につかない打者 */
  positions: (Position | null)[];
};

/** 0 = 打者、1〜3 = その塁にいた走者 */
export type From = 0 | 1 | 2 | 3;
/** 1〜3 = 塁、4 = ホームイン、"out" = アウト */
export type Dest = 1 | 2 | 3 | 4 | "out";

export type RunnerMove = {
  from: From;
  to: Dest;
  /** アウトの場合のみ：フォースアウトか（第3アウト時の得点判定に使う） */
  force?: boolean;
};

import type { DirectionId } from "./directions";

/** 打球方向。"left" | "center" | "right" は以前の版のデータ */
export type Direction = DirectionId | "left" | "center" | "right";

export type ResultCode =
  // 安打
  | "infield_single"
  | "single"
  | "double"
  | "triple"
  | "home_run"
  // アウト
  | "strikeout"
  | "go_p"
  | "go_c"
  | "go_1b"
  | "go_2b"
  | "go_3b"
  | "go_ss"
  | "fo_lf"
  | "fo_cf"
  | "fo_rf"
  | "fo_if"
  | "foul_out"
  | "line_out"
  | "other_out"
  // 出塁
  | "walk"
  | "hbp"
  | "error"
  | "fielders_choice"
  | "dropped_third"
  // その他（打席）
  | "sac_bunt"
  | "sac_fly"
  | "double_play"
  // 走者のプレー（打席ではない）
  | "stolen_base"
  | "wild_pitch"
  | "passed_ball"
  | "balk"
  | "caught_stealing"
  | "pickoff"
  | "runner_out"
  | "other_play";

/** 打球の種類（エラー・野手選択の記録用） */
export type BattedKind = "grounder" | "fly" | "liner";
/** エラーの種類：打球を捕れない／悪送球／送球を捕れない */
export type ErrorType = "fielding" | "throwing" | "receiving";

export type BattingPlay = {
  id: string;
  type: "pa";
  result: ResultCode;
  batterId: string;
  moves: RunnerMove[];
  direction?: Direction;
  /** エラーの場合（ヒットのあとのエラーを含む）：エラーした守備位置 */
  fielder?: Position;
  /** エラーの種類 */
  errorType?: ErrorType;
  /** エラー・野手選択の場合：打球の種類・打球を捕った守備位置・送球した塁 */
  batted?: BattedKind;
  fieldedBy?: Position;
  throwTo?: 1 | 2 | 3 | 4;
  /** 打点を手動で上書き（未指定なら自動計算） */
  rbiOverride?: number;
  /** 第3アウトと同時の得点を認めるか（タイミングプレー）。未指定なら認める */
  runsCountOverride?: boolean;
  note?: string;
  /** 「あとで確認」フラグ */
  needsReview?: boolean;
  createdAt: number;
};

export type RunnerPlay = {
  id: string;
  type: "runner";
  result: ResultCode;
  moves: RunnerMove[];
  runsCountOverride?: boolean;
  note?: string;
  needsReview?: boolean;
  createdAt: number;
};

/**
 * 選手交代・守備位置の変更。
 * - pinch_hitter / pinch_runner / defense：outPlayerId の打順の枠に inPlayerId が入る
 * - position：打順にいる inPlayerId の守備位置だけを変える
 * position を省略すると、守備交代は交代前の選手の守備位置を引き継ぎ、代打・代走は「守備位置なし」になる
 */
export type SubstitutionPlay = {
  id: string;
  type: "sub";
  side: Side;
  kind: "pinch_hitter" | "pinch_runner" | "defense" | "position";
  outPlayerId?: string;
  inPlayerId: string;
  position?: Position | null;
  /** 代走の場合：どの塁の走者と交代したか */
  base?: 1 | 2 | 3;
  createdAt: number;
};

/** 1球ごとの記録（打席の最後の1球は、打席の結果として記録する） */
export type PitchKind = "ball" | "called_strike" | "swinging_strike" | "foul";

export type PitchPlay = {
  id: string;
  type: "pitch";
  pitch: PitchKind;
  createdAt: number;
};

export type EndPlay = {
  id: string;
  type: "end";
  reason: "called" | "time" | "other";
  note?: string;
  createdAt: number;
};

export type Play = BattingPlay | RunnerPlay | SubstitutionPlay | PitchPlay | EndPlay;

export type Game = {
  id: string;
  version: 2;
  /** シーズン（例：2026）。チーム別・シーズン別の通算成績に使う */
  season?: string;
  /** カテゴリー（例：6年生）。チームの成績をカテゴリー別に分けて見るのに使う */
  category?: string;
  /** 勝利投手・敗戦投手を手動で決めた場合（未指定なら自動判定） */
  pitcherDecisions?: { win?: string; loss?: string };
  /** 1日の球数制限（未指定は70球、0は制限なし） */
  pitchLimit?: number;
  date: string;
  tournament: string;
  scheduledInnings: number;
  teams: Record<Side, Team>;
  plays: Play[];
  createdAt: number;
  updatedAt: number;
};

export type Bases = [string | null, string | null, string | null];
