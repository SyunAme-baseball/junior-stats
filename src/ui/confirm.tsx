// 画面内の確認ダイアログ。window.confirm / prompt が使えない環境（アプリ内ブラウザなど）でも動くようにする。

import { useEffect, useState } from "react";

type Request = {
  message: string;
  okLabel: string;
  danger?: boolean;
  input?: { initial: string; multiline?: boolean; placeholder?: string };
  resolve: (value: string | boolean | null) => void;
};

let open: ((r: Request) => void) | null = null;

/** はい／いいえの確認 */
export function ask(message: string, okLabel = "OK", danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    if (!open) return resolve(false);
    open({ message, okLabel, danger, resolve: (v) => resolve(v === true) });
  });
}

/** 文字の入力（キャンセルなら null） */
export function askText(message: string, initial = "", okLabel = "OK", multiline = false, placeholder = ""): Promise<string | null> {
  return new Promise((resolve) => {
    if (!open) return resolve(null);
    open({ message, okLabel, input: { initial, multiline, placeholder }, resolve: (v) => resolve(typeof v === "string" ? v : null) });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    open = (r) => {
      setText(r.input?.initial ?? "");
      setReq(r);
    };
    return () => {
      open = null;
    };
  }, []);
  if (!req) return null;
  const close = (value: string | boolean | null) => {
    req.resolve(value);
    setReq(null);
  };
  return (
    <div className="sheet-backdrop confirm-backdrop" role="alertdialog" aria-modal="true" aria-label={req.message}>
      <div className="sheet confirm-sheet">
        <p className="confirm-message">{req.message}</p>
        {req.input &&
          (req.input.multiline ? (
            <textarea id="confirm-input" rows={5} value={text} placeholder={req.input.placeholder} onChange={(e) => setText(e.target.value)} autoFocus />
          ) : (
            <input id="confirm-input" value={text} placeholder={req.input.placeholder} onChange={(e) => setText(e.target.value)} autoFocus />
          ))}
        <div className="confirm-actions">
          <button className="secondary-button" onClick={() => close(req.input ? null : false)}>
            キャンセル
          </button>
          <button className={req.danger && !req.input ? "danger-button solid" : "primary-button"} onClick={() => close(req.input ? text : true)}>
            {req.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
