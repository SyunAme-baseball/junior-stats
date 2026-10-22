import { useCallback, useEffect, useMemo, useState } from "react";
import { pitchesEarlierToday } from "./domain/pitchCount";
import { decodePayload, isPlanPayload, isRosterPayload, makePayload, makePlanPayload, makeRosterPayload, type SharePayload } from "./domain/share";
import { planTitle, type LineupPlan } from "./domain/plan";
import type { Game, Player, TeamProfile } from "./domain/types";
import { exportAll, exportGame, importData, normalizeGame } from "./storage/repository";
import { LocalStorageRepository } from "./storage/localStorageRepository";
import { GameScreen } from "./ui/GameScreen";
import { HomeScreen } from "./ui/HomeScreen";
import { ResultScreen } from "./ui/ResultScreen";
import { SetupScreen } from "./ui/SetupScreen";
import { ImportDialog, PlanImportDialog, RosterImportDialog, ShareDialog } from "./ui/ShareImport";
import { TeamScreen } from "./ui/TeamScreen";
import { RosterScreen } from "./ui/RosterScreen";
import { PlayerScreen } from "./ui/PlayerScreen";
import { TeamMembers } from "./ui/TeamMembers";
import { isActive } from "./domain/roster";
import { askText, ConfirmHost } from "./ui/confirm";
import "./App.css";

type View =
  | { name: "home" }
  | { name: "setup"; teamId?: string; planId?: string }
  | { name: "game" }
  | { name: "result" }
  | { name: "team"; id: string }
  | { name: "newTeam" }
  | { name: "roster"; back: View }
  | { name: "player"; id: string; back: View };

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function App() {
  const repo = useMemo(() => new LocalStorageRepository(), []);
  const [games, setGames] = useState(() => repo.list());
  const [teams, setTeams] = useState(() => repo.listTeams());
  const [roster, setRoster] = useState(() => repo.getRoster());
  const [plans, setPlans] = useState(() => repo.listPlans());
  // ホームのチーム成績・スコア表示用（一覧が変わったら読み直す）
  const allGames = useMemo(() => repo.allGames(), [repo, games]);
  const [game, setGame] = useState<Game | null>(() => {
    const id = repo.getCurrentId();
    return id ? repo.get(id) : null;
  });
  const [view, setView] = useState<View>(() => (game ? { name: "game" } : { name: "home" }));
  const [importing, setImporting] = useState<{ games: Game[]; teams: TeamProfile[]; roster?: Player[]; plans?: LineupPlan[] } | null>(null);
  const [sharing, setSharing] = useState<{ title: string; payload: SharePayload } | null>(null);
  const [toast, setToast] = useState("");

  // 共有リンク（#import=...）で開かれたら、取り込み画面を出す
  useEffect(() => {
    const m = location.hash.match(/^#import=(.+)$/);
    if (!m) return;
    history.replaceState(null, "", location.pathname + location.search);
    decodePayload(m[1])
      .then((p) => setImporting({ games: p.games.map(normalizeGame), teams: p.teams, roster: p.roster, plans: p.plans }))
      .catch(() => setToast("共有リンクを読み取れませんでした。リンクが途中で切れていないか確認してください。"));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  /** 「戻る」で戻る先（チーム画面から試合を開いた場合など） */
  const [returnTo, setReturnTo] = useState<View>({ name: "home" });

  const saveTeam = useCallback(
    (t: TeamProfile) => {
      repo.saveTeam(t);
      setTeams(repo.listTeams());
      setRoster(repo.getRoster());
    },
    [repo],
  );

  // 試合中に加わった選手（代打の新しい名前など）を、登録チームの名簿にも追加する
  const syncRoster = useCallback(
    (g: Game) => {
      for (const side of ["away", "home"] as const) {
        const profile = repo.getTeam(g.teams[side].id);
        if (!profile) continue;
        // 名簿にいる選手（上の学年から借りた選手など）はチームに加えない。試合中に新しく入力した選手だけ加える
        const clubRoster = repo.getRoster();
        const missing = g.teams[side].roster.filter((p) => !profile.players.some((x) => x.id === p.id) && !clubRoster.some((x) => x.id === p.id));
        // 背番号は試合ごとのものなので名簿には入れない
        const added = missing.map(({ id, name }) => ({ id, name }));
        if (added.length) saveTeam({ ...profile, players: [...profile.players, ...added], updatedAt: Date.now() });
      }
    },
    [repo, saveTeam],
  );

  // 変更のたびに保存（自動保存）
  const update = useCallback(
    (g: Game) => {
      repo.save(g);
      syncRoster(g);
      setGame(g);
      setGames(repo.list());
    },
    [repo, syncRoster],
  );

  const open = (id: string, from: View = { name: "home" }) => {
    const g = repo.get(id);
    if (!g) return;
    repo.setCurrentId(id);
    setGame(g);
    setReturnTo(from);
    setView({ name: "game" });
  };

  const leaveGame = () => {
    repo.setCurrentId(null);
    setGame(null);
    setGames(repo.list());
    setView(returnTo);
  };

  const overlays = (
    <>
      {importing && isRosterPayload(importing) && (
        <RosterImportDialog
          payload={importing}
          repo={repo}
          onClose={() => setImporting(null)}
          onDone={(msg) => {
            setImporting(null);
            setTeams(repo.listTeams());
            setRoster(repo.getRoster());
            setToast(msg);
          }}
        />
      )}
      {importing && isPlanPayload(importing) && (
        <PlanImportDialog
          payload={importing}
          repo={repo}
          onClose={() => setImporting(null)}
          onDone={(planId, msg) => {
            setImporting(null);
            setTeams(repo.listTeams());
            setRoster(repo.getRoster());
            setPlans(repo.listPlans());
            setToast(msg);
            setReturnTo({ name: "home" });
            setView({ name: "setup", planId });
          }}
        />
      )}
      {importing && !isRosterPayload(importing) && !isPlanPayload(importing) && (
        <ImportDialog
          payload={importing}
          repo={repo}
          onClose={() => setImporting(null)}
          onDone={(msg) => {
            setImporting(null);
            setTeams(repo.listTeams());
            setRoster(repo.getRoster());
            setGames(repo.list());
            if (game) setGame(repo.get(game.id));
            setToast(msg);
          }}
        />
      )}
      <ConfirmHost />
      {sharing && <ShareDialog title={sharing.title} payload={sharing.payload} onClose={() => setSharing(null)} />}
      {toast && (
        <div className="toast" role="status" onClick={() => setToast("")}>
          {toast}
        </div>
      )}
    </>
  );

  const share = (title: string, gs: Game[]) => setSharing({ title, payload: makePayload(gs, repo.listTeams()) });

  return (
    <>
      {renderScreen()}
      {overlays}
    </>
  );

  function renderScreen() {
  if (view.name === "setup")
    return (
      <SetupScreen
        key={view.planId ?? "new"}
        profiles={teams}
        roster={roster}
        initialTeamId={view.teamId}
        initialPlan={view.planId ? plans.find((p) => p.id === view.planId) : undefined}
        onSavePlan={(plan) => {
          repo.savePlan(plan);
          setPlans(repo.listPlans());
          setToast("メンバー表を保存しました。ホームの「予定の試合（メンバー表）」から開けます。");
          setView({ name: "home" });
        }}
        onCancel={() => setView(returnTo)}
        onCreate={(g) => {
          update(g);
          // メンバー表から始めた試合は、メンバー表を片付ける
          if (view.planId) {
            repo.removePlan(view.planId);
            setPlans(repo.listPlans());
          }
          // 次の試合の初期値として、カテゴリーごとの打順・守備位置と、選手ごとの背番号を覚えておく
          for (const side of ["away", "home"] as const) {
            const t = g.teams[side];
            const profile = repo.getTeam(t.id);
            if (!profile) continue;
            const lastNumbers = { ...profile.lastNumbers };
            for (const p of t.roster) if (p.number) lastNumbers[p.id] = p.number;
            saveTeam({
              ...profile,
              lastLineups: { ...profile.lastLineups, [g.category ?? "全学年"]: t.lineup.map((playerId, i) => ({ playerId, position: t.positions[i] })) },
              latestLineup: t.lineup.map((playerId, i) => ({ playerId, position: t.positions[i] })),
              lastNumbers,
              updatedAt: Date.now(),
            });
          }
          repo.setCurrentId(g.id);
          setView({ name: "game" });
        }}
      />
    );

  if (view.name === "game" && game)
    return (
      <GameScreen
        game={game}
        onChange={update}
        onShowResult={() => setView({ name: "result" })}
        onBack={leaveGame}
        earlierPitches={pitchesEarlierToday(repo.allGames(), game)}
        onShare={() => share(`${game.date} ${game.teams.away.name} 対 ${game.teams.home.name}`, [game])}
      />
    );

  if (view.name === "player") {
    // 名簿にいない選手（合同チームの他チームの選手など）は、チームや試合の名簿から探す
    const all = repo.allGames();
    const player =
      roster.find((p) => p.id === view.id) ??
      teams.flatMap((t) => t.players).find((p) => p.id === view.id) ??
      all.flatMap((g) => [...g.teams.away.roster, ...g.teams.home.roster]).find((p) => p.id === view.id);
    if (player) return <PlayerScreen player={player} games={all} onBack={() => setView(view.back)} />;
  }

  if (view.name === "result" && game) return <ResultScreen game={game} onChange={update} onBack={() => setView({ name: "game" })} />;

  if (view.name === "roster")
    return (
        <RosterScreen
          roster={roster}
          teams={teams}
          onSave={(players) => {
            repo.saveRoster(players);
            setRoster(repo.getRoster());
            setTeams(repo.listTeams());
          }}
          onJoin={(player, teamIds) => {
            for (const t of repo.listTeams()) if (teamIds.includes(t.id)) repo.saveTeam({ ...t, players: [...t.players, player], updatedAt: Date.now() });
            setTeams(repo.listTeams());
          }}
          onOpenPlayer={(id) => setView({ name: "player", id, back: view })}
          onShare={() =>
            setSharing({ title: `選手名簿（${roster.filter(isActive).length}人）`, payload: makeRosterPayload(repo.getRoster(), repo.listTeams()) })
          }
          onBack={() => setView(view.back)}
        />
    );

  if (view.name === "newTeam")
    return (
      <main className="app">
        <header className="topbar">
          <button className="link-button" onClick={() => setView({ name: "home" })}>
            ← 一覧
          </button>
          <span className="topbar-title">チームを作る</span>
          <span />
        </header>
        <TeamMembers
          roster={roster}
          onOpenRoster={() => setView({ name: "roster", back: view })}
          onCancel={() => setView({ name: "home" })}
          onSave={(t) => {
            saveTeam(t);
            setView({ name: "team", id: t.id });
          }}
        />
      </main>
    );

  if (view.name === "team") {
    const team = teams.find((t) => t.id === view.id);
    if (team)
      return (
        <TeamScreen
          key={team.id}
          team={team}
          roster={roster}
          onOpenRoster={() => setView({ name: "roster", back: view })}
          games={repo.allGames()}
          onSave={saveTeam}
          onDelete={() => {
            repo.removeTeam(team.id);
            setTeams(repo.listTeams());
            setView({ name: "home" });
          }}
          onNewGame={() => {
            setReturnTo(view);
            setView({ name: "setup", teamId: team.id });
          }}
          onOpenGame={(id) => open(id, view)}
          onOpenPlayer={(id) => setView({ name: "player", id, back: view })}
          onShare={() =>
            share(
              `${team.name}の全試合`,
              repo.allGames().filter((g) => g.teams.away.id === team.id || g.teams.home.id === team.id),
            )
          }
          onBack={() => {
            setTeams(repo.listTeams());
            setView({ name: "home" });
          }}
        />
      );
  }

  return (
    <HomeScreen
      games={games}
      allGames={allGames}
      teams={teams}
      onOpen={(id) => open(id)}
      onNew={() => {
        setReturnTo({ name: "home" });
        setView({ name: "setup" });
      }}
      onNewTeam={() => setView({ name: "newTeam" })}
      rosterCount={roster.filter(isActive).length}
      onOpenRoster={() => setView({ name: "roster", back: { name: "home" } })}
      onOpenTeam={(id) => setView({ name: "team", id })}
      onDelete={(id) => {
        repo.remove(id);
        setGames(repo.list());
      }}
      onExport={(id) => {
        const g = repo.get(id);
        if (g) download(`mieru-score-${g.date || "game"}-${g.teams.away.name}-vs-${g.teams.home.name}.json`, exportGame(g));
      }}
      onExportAll={() => download(`mieru-score-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAll(repo))}
      plans={plans.map((p) => ({ id: p.id, title: planTitle(p, teams) }))}
      onOpenPlan={(id) => {
        setReturnTo({ name: "home" });
        setView({ name: "setup", planId: id });
      }}
      onSharePlan={(id) => {
        const plan = plans.find((p) => p.id === id);
        if (plan) setSharing({ title: `メンバー表：${planTitle(plan, teams)}`, payload: makePlanPayload(plan, repo.listTeams(), repo.getRoster()) });
      }}
      onDeletePlan={(id) => {
        repo.removePlan(id);
        setPlans(repo.listPlans());
      }}
      onReorderTeams={(ids) => {
        for (const t of repo.listTeams()) {
          const order = ids.indexOf(t.id);
          if (order >= 0 && t.order !== order) repo.saveTeam({ ...t, order });
        }
        setTeams(repo.listTeams());
      }}
      onPaste={async () => {
        const text = (await askText("受け取った共有コード（またはリンク）を貼り付けてください。", "", "読み込む", true, "共有コード"))?.trim();
        if (!text) return;
        try {
          if (text.startsWith("{")) setImporting(importData(text));
          else {
            const p = await decodePayload(text.replace(/^.*#import=/, ""));
            setImporting({ games: p.games.map(normalizeGame), teams: p.teams, roster: p.roster, plans: p.plans });
          }
        } catch {
          setToast("共有コードを読み取れませんでした。途中で切れていないか確認してください。");
        }
      }}
      onImport={(json) => {
        try {
          setImporting(importData(json));
        } catch (e) {
          setToast(e instanceof Error ? e.message : "読み込めませんでした");
        }
      }}
    />
  );
  }
}
