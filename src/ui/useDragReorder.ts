import { useRef, useState, type PointerEvent } from "react";

/**
 * リストの行を、つまみ（ハンドル）を指でなぞって並べ替える。
 * 指が隣の行に入ったところでその場で入れ替えるので、並びがすぐ目に見える。
 * マウス・タッチの両方で動く（Pointer Events）。
 */
export function useDragReorder<T extends HTMLElement>(onMove: (from: number, to: number) => void) {
  const listRef = useRef<T>(null);
  const current = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const end = () => {
    current.current = null;
    setDragging(null);
  };

  const handleProps = (index: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      current.current = index;
      setDragging(index);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const from = current.current;
      if (from === null || !listRef.current) return;
      const rows = Array.from(listRef.current.children) as HTMLElement[];
      const to = rows.findIndex((row) => {
        const r = row.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (to === -1 || to === from) return;
      onMove(from, to);
      current.current = to;
      setDragging(to);
    },
    onPointerUp: end,
    onPointerCancel: end,
  });

  return { listRef, dragging, handleProps };
}

/** 配列の from 番目を to 番目へ移す */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
