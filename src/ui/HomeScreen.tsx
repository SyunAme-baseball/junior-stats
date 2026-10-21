import { useMemo, useRef, useState } from "react";
import { gradeLabel } from "../domain/categories";
import { isActive, teamGradeLabel } from "../domain/roster";
import { replay } from "../domain/engine";
import { summarizeSeason } from "../domain/season";
import type { Game, TeamProfile } from "../domain/types";
import type { GameSummary } from "../storage/repository";
import { ask } from "./confirm";
import { TeamIcon } from "./TeamIcon";
import { moveItem, useDragReorder } from "./useDragReorder";

type Props = {
  games: GameSummary[];
  /** チームの成績・最近の試合のスコアを出すための全試合 */
  allGames: Game[];
  teams: TeamProfile[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onNewTeam: () => void;
  /** 名簿にいる今の選手の人数 */
  rosterCount: number;
  onOpenRoster: () => void;
  onOpenTeam: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onExportAll: () => void;
  onImport: (json: string) => void;
  onPaste: () => void;
  /** 保存したメンバー表（予定の試合） */
  plans: { id: string; title: string }[];
  onOpenPlan: (id: string) => void;
  onSharePlan: (id: string) => void;
  onDeletePlan: (id: string) => void;
  /** チームの並び順を保存する（上から順のID） */
  onReorderTeams: (ids: string[]) => void;
};

const ALL = "すべて";
const MARK = { win: "勝", loss: "負", draw: "分", playing: "途中", none: "" } as const;

/** 例：「6年 8人・5年 4人」 */
function gradeCounts(t: TeamProfile) {
  const counts = new Map<number | undefined, number>();
  for (const p of t.players.filter(isActive)) counts.set(p.grade, (counts.get(p.grade) ?? 0) + 1);
  const keys = [...counts.keys()].sort((a, b) => (b ?? 0) - (a ?? 0));
  const list = keys.length ? keys.map((g) => `${gradeLabel(g)} ${counts.get(g)}人`).join("・") : "選手なし";
  return t.maxGrade !== undefined ? `${teamGradeLabel(t.maxGrade)}｜${list}` : list;
}

export function HomeScreen({ games, allGames, teams, onOpen, onNew, onNewTeam, rosterCount, onOpenRoster, onOpenTeam, onDelete, onExport, onExportAll, onImport, onPaste, plans, onOpenPlan, onSharePlan, onDeletePlan, onReorderTeams }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const seasons = [...new Set(games.map((g) => g.season ?? "").filter(Boolean))].sort().reverse();
  const [season, setSeason] = useState(seasons[0] ?? ALL);
  const inSeason = (s?: string) => season === ALL || s === season;
  const seasonFilter = season === ALL ? {} : { season };

  // チームごとの勝敗・打率・盗塁（選んでいるシーズン）
  const teamStats = useMemo(() => {
    const m = new Map<string, { win: number; loss: number; draw: number; avg: string; sb: number }>();
    for (const t of teams) {
      const sum = summarizeSeason(t, allGames, seasonFilter);
      const ab = sum.batting.reduce((n, b) => n + b.ab, 0);
      const h = sum.batting.reduce((n, b) => n + b.h, 0);
      m.set(t.id, { ...sum.record, avg: ab ? (h / ab).toFixed(3).replace(/^0/, "") : "—", sb: sum.totals.sb });
    }
    return m;
  }, [teams, allGames, season]);

  // 試合ごとのスコアと、登録チームから見た勝敗
  const scores = useMemo(() => {
    const ids = new Set(teams.map((t) => t.id));
    const m = new Map<string, { away: number; home: number; mark: "win" | "loss" | "draw" | "playing" | null }>();
    for (const g of allGames) {
      const st = replay(g);
      const mine = ids.has(g.teams.away.id) ? "away" : ids.has(g.teams.home.id) ? "home" : null;
      let mark: "win" | "loss" | "draw" | "playing" | null = null;
      if (!st.finished) mark = "playing";
      else if (mine) mark = st.winner === "draw" ? "draw" : st.winner === mine ? "win" : "loss";
      m.set(g.id, { away: st.runs.away, home: st.runs.home, mark });
    }
    return m;
  }, [allGames, teams]);

  // 並び替え中の並び（完了で保存）
  const [ordering, setOrdering] = useState<TeamProfile[] | null>(null);
  const drag = useDragReorder<HTMLUListElement>((from, to) => setOrdering((xs) => (xs ? moveItem(xs, from, to) : xs)));

  return (
    <>
      <header className="home-hero">
        <svg className="home-hero-field" aria-hidden="true" viewBox="0 0 390 300" preserveAspectRatio="xMidYMax slice">
          <path d="M0 40 H390 M0 100 H390 M0 160 H390 M0 220 H390 M0 280 H390" stroke="#2a7343" strokeWidth="30" />
          <g transform="translate(160 92) scale(0.6)">
          <path d="M195 330 L330 195 L195 60 L60 195 Z" fill="#c9925a" />
          <path d="M195 300 L292 203 L195 106 L98 203 Z" fill="#3a8a55" />
          <path d="M195 330 L330 195 L195 60 L60 195 Z" fill="none" stroke="#fff" strokeWidth="3" />
          <circle cx="195" cy="203" r="16" fill="#c9925a" />
          <rect x="320" y="185" width="18" height="18" transform="rotate(45 329 194)" fill="#fff" />
          <rect x="186" y="51" width="18" height="18" transform="rotate(45 195 60)" fill="#fff" />
          <rect x="51" y="185" width="18" height="18" transform="rotate(45 60 194)" fill="#fff" />
          </g>
        </svg>
        <div className="home-hero-text">
          <p>少年野球のスコアブック＆成績集計</p>
          <h1>ジュニアスタッツ</h1>
          <span>スコアをつけるだけで、卒団まで成績がたまる。</span>
        </div>
      </header>
    <main className="app home">
      {teams.length === 0 && (
        <section className="panel welcome-panel">
          <div className={rosterCount ? "welcome-step done" : "welcome-step"}>
            <h2>{rosterCount ? "✓ はじめに：選手名簿を用意しました" : "はじめに：選手名簿を用意しましょう"}</h2>
            {rosterCount ? (
              <p className="muted">
                名簿に{rosterCount}人います。追加や学年の変更は、下の「名簿」からいつでもできます。
              </p>
            ) : (
              <>
                <p className="muted">成績は名簿の選手ごとにたまっていきます。どちらかを選んでください。</p>
                <button className="welcome-choice" onClick={onOpenRoster}>
                  <strong>① 新しく名簿を作る</strong>
                  <small>チームで最初に使う人（指導者・スコア係）向け。選手の名前と学年を入れます。</small>
                </button>
                <button className="welcome-choice" onClick={onPaste}>
                  <strong>② 名簿を引き継ぐ（コードを貼り付け）</strong>
                  <small>ほかの人から名簿の共有コードを受け取った人向け。リンクで受け取った場合は、そのリンクをタップするだけで取り込めます。</small>
                </button>
                <p className="muted small">
                  ファイルで受け取った場合は{" "}
                  <button className="link-button small" onClick={() => fileRef.current?.click()}>
                    ファイルから読み込む
                  </button>
                  。
                </p>
              </>
            )}
          </div>
          <div className={rosterCount ? "welcome-step" : "welcome-step later"}>
            <h2>つぎに：チームを登録しましょう</h2>
            <p className="muted">
              <strong>学年ごとにチームを作成できます</strong>（例：6年生チーム、4年生以下チーム）。学年を選ぶと、名簿からその学年までの選手が並び、そのままチームを作れます。試合の成績はチームごとにたまります。
            </p>
            <button className="welcome-choice" onClick={onNewTeam} disabled={!rosterCount}>
              <strong>③ チームを作る</strong>
              <small>{rosterCount ? "学年を選んで、チームに入れる選手を確認します。" : "名簿に選手を入れると押せるようになります。"}</small>
            </button>
          </div>
        </section>
      )}

      <button className="home-cta" onClick={onNew}>
        ＋ 新しい試合をつける
      </button>

      {plans.length > 0 && (
        <section className="panel">
          <h2>予定の試合（メンバー表）</h2>
          <ul className="plan-list">
            {plans.map((p) => (
              <li key={p.id}>
                <button className="plan-open" onClick={() => onOpenPlan(p.id)}>
                  <strong>{p.title}</strong>
                  <small>開いて確認・修正し、「試合開始」で始めます</small>
                </button>
                <span className="plan-actions">
                  <button className="secondary-button" onClick={() => onSharePlan(p.id)}>
                    共有
                  </button>
                  <button
                    className="link-button danger"
                    onClick={async () => {
                      if (await ask(`メンバー表「${p.title}」を削除します。`, "削除する")) onDeletePlan(p.id);
                    }}
                  >
                    削除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {seasons.length > 0 && (
        <div className="segmented season-tabs">
          {[...seasons, ALL].map((s) => (
            <button key={s} className={season === s ? "seg on" : "seg"} onClick={() => setSeason(s)}>
              {s === ALL ? ALL : `${s}シーズン`}
            </button>
          ))}
        </div>
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>わたしたちのチーム</h2>
          <span className="topbar-actions">
            {ordering ? (
              <button
                className="secondary-button"
                onClick={() => {
                  onReorderTeams(ordering.map((t) => t.id));
                  setOrdering(null);
                }}
              >
                完了
              </button>
            ) : (
              <>
                {teams.length > 1 && (
                  <button className="link-button" onClick={() => setOrdering(teams)}>
                    並び替え
                  </button>
                )}
                <button className="link-button" onClick={onNewTeam}>
                  ＋ チームを作る
                </button>
              </>
            )}
          </span>
        </div>
        <button className="home-roster" onClick={onOpenRoster}>
          <span className="home-roster-icon" aria-hidden="true">
            名
          </span>
          <span className="home-team-name">
            <strong>名簿</strong>
            <small>{rosterCount ? `今いる選手 ${rosterCount}人｜追加・進学・卒団はここで` : "まずは選手の名前と学年を入れます"}</small>
          </span>
          <span className="home-roster-go" aria-hidden="true">
            ›
          </span>
        </button>
        {ordering ? (
          <>
            <p className="muted small">左の「⋮⋮」を指で押したまま上下に動かして、並べ替えてください。終わったら「完了」を押します。</p>
            <ul className="team-cards reordering" ref={drag.listRef}>
              {ordering.map((t, i) => (
                <li key={t.id} className={drag.dragging === i ? "dragging" : undefined}>
                  <span className="team-drag" role="button" aria-label={`${t.name}：押したまま上下に動かして並べ替え`} {...drag.handleProps(i)}>
                    ⋮⋮
                  </span>
                  <span className="reorder-row">
                    <TeamIcon team={t} />
                    <span className="home-team-name">
                      <strong>{t.name || "（名前のないチーム）"}</strong>
                      <small>{gradeCounts(t)}</small>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : teams.length === 0 ? (
          <p className="empty-state">
            {rosterCount
              ? "「＋ チームを作る」で学年（例：4年生）を選ぶと、名簿から4年生以下の選手が並び、そのままチームを作れます。"
              : "名簿に選手を入れてから、学年を選んでチームを作ります。試合の成績（打撃・投手の勝敗・盗塁など）はチームごとにたまっていきます。"}
          </p>
        ) : (
          <ul className="team-cards">
            {teams.map((t) => {
              const st = teamStats.get(t.id);
              return (
                <li key={t.id}>
                  <button className="home-team" onClick={() => onOpenTeam(t.id)}>
                    <span className="home-team-head">
                      <TeamIcon team={t} />
                      <span className="home-team-name">
                        <strong>{t.name || "（名前のないチーム）"}</strong>
                        <small>{gradeCounts(t)}</small>
                      </span>
                    </span>
                    {st && (
                      <span className="home-team-stats">
                        <span>
                          <small>勝敗</small>
                          <b>
                            {st.win}勝{st.loss}敗{st.draw ? `${st.draw}分` : ""}
                          </b>
                        </span>
                        <span>
                          <small>チーム打率</small>
                          <b>{st.avg}</b>
                        </span>
                        <span>
                          <small>盗塁</small>
                          <b>{st.sb}</b>
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>最近の試合</h2>
          <span className="topbar-actions">
            <button className="secondary-button" onClick={onPaste}>
              コードを貼り付け
            </button>
            <button className="secondary-button" onClick={() => fileRef.current?.click()}>
              ファイル
            </button>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) onImport(await file.text());
              e.target.value = "";
            }}
          />
        </div>
        {games.filter((g) => inSeason(g.season)).length === 0 ? (
          <p className="empty-state">この期間の試合はありません。</p>
        ) : (
          <ul className="game-list">
            {games
              .filter((g) => inSeason(g.season))
              .map((g) => (
                <li key={g.id}>
                  <button className="game-item home-game" onClick={() => onOpen(g.id)}>
                    <span className={`home-mark ${scores.get(g.id)?.mark ?? "none"}`} aria-hidden="true">
                      {MARK[scores.get(g.id)?.mark ?? "none"]}
                    </span>
                    <span className="home-game-body">
                      <strong>
                        {g.awayName} 対 {g.homeName}
                      </strong>
                      <span>
                        {g.date} {g.tournament}
                      </span>
                    </span>
                    <b className="home-score">
                      {scores.get(g.id)?.away ?? 0}-{scores.get(g.id)?.home ?? 0}
                    </b>
                  </button>
                  <div className="game-actions">
                    <button className="link-button" onClick={() => onExport(g.id)}>
                      書き出し
                    </button>
                    <button
                      className="link-button danger"
                      onClick={async () => {
                        if (await ask(`${g.awayName} 対 ${g.homeName} の記録を削除します。元に戻せません。`, "削除する")) onDelete(g.id);
                      }}
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>バックアップ</h2>
        <p className="muted">
          記録はこのブラウザに保存されます。機種変更やブラウザのデータ削除に備えて、ときどき全データを書き出してください。書き出したファイルは「ファイルから読み込む」で戻せます。
        </p>
        <button className="secondary-button" onClick={onExportAll}>
          全データ（チーム・全試合）を書き出す
        </button>
      </section>

      <footer className="footer">
        <p className="disclaimer">本アプリは少年野球の記録を手助けするためのものです。犠打・失策・打点・勝敗投手などの判断が公式記録と異なる場合があります。</p>
        <p className="copyright">© 2026 ジュニアスタッツ　無断での複製・配布を禁止します。</p>
      </footer>
    </main>
    </>
  );
}
