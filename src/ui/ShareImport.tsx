import { useEffect, useMemo, useState, type ReactNode } from "react";
import { replay } from "../domain/engine";
import { encodePayload, MAX_LINK_LENGTH, remapTeam, teamsInGames, type SharePayload } from "../domain/share";
import { mergeIntoRoster } from "../domain/roster";
import type { Game, Player, TeamProfile } from "../domain/types";
import type { GameRepository } from "../storage/repository";
import { teamLabel } from "./SetupScreen";

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

export function ShareDialog({ title, payload, onClose }: { title: string; payload: SharePayload; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const fileName = `mieru-score-${new Date().toISOString().slice(0, 10)}.json`;

  useEffect(() => {
    encodePayload(payload)
      .then((c) => {
        setCode(c);
        setLink(`${location.origin}${location.pathname}#import=${c}`);
      })
      .catch(() => setLink(""));
  }, [payload]);

  const tooLong = link !== null && (link === "" || link.length > MAX_LINK_LENGTH);

  const sendLink = async () => {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: "ジュニアスタッツ", text: title, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setMessage("リンクをコピーしました。LINEなどに貼り付けて送ってください。");
      }
    } catch {
      /* 共有をキャンセルした */
    }
  };

  const copyCode = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => setMessage("共有コードをコピーしました。LINEなどに貼り付けて送ってください。受け取った人は、トップ画面の「コードを貼り付け」に貼ると取り込めます。"))
      .catch(() => setMessage("コピーできませんでした。下のコードを長押しして選択し、コピーしてください。"));
  };

  const sendFile = async () => {
    const file = new File([JSON.stringify(payload)], fileName, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "ジュニアスタッツ", text: title });
        return;
      }
    } catch {
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage("ファイルを保存しました。メールやLINEで送ってください。");
  };

  return (
    <Sheet title="共有する" onClose={onClose}>
      <p className="help">
        {title}
        <br />
        受け取った人がリンクを開く（またはファイルを「ファイルから読み込む」）と、試合とチームの名簿を取り込めます。取り込んだ試合は、その人の登録チームの成績に合算できます。
      </p>
      <p className="muted small">
        試合{payload.games.length}件・チーム{payload.teams.length}件
        {link && !tooLong && `・リンクの長さ ${link.length.toLocaleString()}文字`}
      </p>
      {tooLong && <p className="notice">データが大きいため、リンクでは送れません。「ファイルで送る」を使ってください。</p>}
      {message && <p className="notice">{message}</p>}
      <div className="stack">
        <button className="primary-button" disabled={!link || tooLong} onClick={sendLink}>
          {link === null ? "リンクを作成中…" : "リンクを送る"}
        </button>
        <button className="secondary-button" disabled={!code} onClick={copyCode}>
          共有コードをコピー
        </button>
        <button className="secondary-button" onClick={sendFile}>
          ファイルで送る
        </button>
      </div>
      {code && message.startsWith("コピーできません") && <textarea id="share-code" readOnly rows={4} value={code} onFocus={(e) => e.target.select()} />}
    </Sheet>
  );
}

const NEW = "__new__";
const NONE = "";

type Props = {
  payload: { games: Game[]; teams: TeamProfile[]; roster?: Player[] };
  repo: GameRepository;
  onDone: (message: string) => void;
  onClose: () => void;
};

/** 受け取った試合を、どの登録チームの成績に入れるかを選んで取り込む */
export function ImportDialog({ payload, repo, onDone, onClose }: Props) {
  const profiles = repo.listTeams();
  const found = useMemo(() => teamsInGames(payload.games), [payload]);
  const extraTeams = payload.teams.filter((t) => !found.some((f) => f.id === t.id));
  const teamsToMap = [...found, ...extraTeams.map((t) => ({ id: t.id, name: t.name }))];

  const initial = () => {
    const m: Record<string, string> = {};
    for (const t of teamsToMap) {
      const same = profiles.find((p) => p.id === t.id);
      const sameName = profiles.find((p) => p.name === t.name);
      m[t.id] = same ? same.id : payload.teams.some((p) => p.id === t.id) ? NEW : (sameName?.id ?? NONE);
    }
    return m;
  };
  const [mapping, setMapping] = useState<Record<string, string>>(initial);

  const run = () => {
    let games = payload.games;
    let teamsAdded = 0;
    for (const t of teamsToMap) {
      const target = mapping[t.id];
      if (target === NONE) continue;
      if (target === NEW) {
        // 送り主の登録チームならそのまま（選手IDも同じ）登録する。そうでなければ試合の名簿から作る
        const fromPayload = payload.teams.find((p) => p.id === t.id);
        const g = games.find((x) => x.teams.away.id === t.id || x.teams.home.id === t.id);
        const fromGame = g ? (g.teams.away.id === t.id ? g.teams.away : g.teams.home) : null;
        const profile: TeamProfile = fromPayload ?? {
          id: t.id,
          name: t.name,
          // 背番号は試合ごとのものなので名簿には入れない
          players: (fromGame?.roster ?? []).map(({ id, name }) => ({ id, name })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        repo.saveTeam(profile);
        teamsAdded += 1;
        continue;
      }
      let profile = repo.getTeam(target);
      if (!profile) continue;
      const incoming = payload.teams.find((p) => p.id === t.id);
      if (profile.id === t.id) {
        // 同じチーム：知らない選手だけ名簿に足す
        const extra = (incoming?.players ?? []).filter((p) => !profile!.players.some((x) => x.id === p.id));
        profile = { ...profile, players: [...profile.players, ...extra] };
      } else {
        // 別のIDのチーム：名前で選手を対応させて付け替える
        games = games.map((g) => {
          const r = remapTeam(g, t.id, profile!);
          const extra = r.newPlayers.filter((p) => !profile!.players.some((x) => x.id === p.id)).map(({ id, name }) => ({ id, name }));
          profile = { ...profile!, players: [...profile!.players, ...extra] };
          return r.game;
        });
      }
      for (const g of games) {
        for (const side of ["away", "home"] as const) {
          if (g.teams[side].id !== profile.id) continue;
          const extra = g.teams[side].roster.filter((p) => !profile!.players.some((x) => x.id === p.id)).map(({ id, name }) => ({ id, name }));
          if (extra.length) profile = { ...profile, players: [...profile.players, ...extra] };
        }
      }
      repo.saveTeam({ ...profile, updatedAt: Date.now() });
    }

    // バックアップに名簿があれば、この端末の名簿にない選手を加える
    if (payload.roster?.length) repo.saveRoster(mergeIntoRoster(repo.getRoster(), payload.roster));

    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const g of games) {
      const local = repo.get(g.id);
      if (!local) {
        repo.save(g);
        added += 1;
      } else if (g.updatedAt >= local.updatedAt) {
        repo.save(g);
        updated += 1;
      } else skipped += 1;
    }
    const parts = [`試合${added}件を追加`];
    if (updated) parts.push(`${updated}件を新しい記録に更新`);
    if (skipped) parts.push(`${skipped}件はこの端末の方が新しいためそのまま`);
    if (teamsAdded) parts.push(`チーム${teamsAdded}件を登録`);
    onDone(parts.join("、") + "しました。");
  };

  return (
    <Sheet title="データを取り込む" onClose={onClose}>
      <ul className="import-games">
        {payload.games.map((g) => {
          const s = replay(g);
          const exists = !!repo.get(g.id);
          return (
            <li key={g.id}>
              <strong>
                {g.teams.away.name} {s.runs.away} - {s.runs.home} {g.teams.home.name}
              </strong>
              <span>
                {g.date} {g.tournament} {s.finished ? "" : "（途中）"} {exists ? "・この端末にもあります" : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {teamsToMap.length > 0 && (
        <div className="field">
          どのチームの成績として取り込みますか？
          {teamsToMap.map((t) => {
            const same = profiles.find((p) => p.id === t.id);
            return (
              <label key={t.id} className="map-row">
                <span>{t.name}</span>
                <select value={mapping[t.id]} onChange={(e) => setMapping((m) => ({ ...m, [t.id]: e.target.value }))}>
                  <option value={NONE}>チームに入れない（試合だけ取り込む）</option>
                  {!same && <option value={NEW}>新しいチームとして登録</option>}
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {teamLabel(p)}
                      {p.id === t.id ? "（同じチーム）" : ""}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <p className="muted small">別のチームに入れる場合は、選手を名前で対応させます。名簿にいない選手は追加されます。</p>
        </div>
      )}
      <div className="sheet-actions">
        <button className="primary-button" onClick={run}>
          取り込む
        </button>
      </div>
    </Sheet>
  );
}
