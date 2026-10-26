import { type RefObject, useEffect, useState } from "react";

export const ROW_HEIGHT = 44;
const MIN_ROWS = 8;
const NARROW_ROWS = 10;
const NARROW = "(max-width: 1200px)";

// Rows that fit beside the right-hand column, never fewer than eight.
export function rowsFor(columnHeight: number, fixedHeight: number): number {
  return Math.max(
    MIN_ROWS,
    Math.floor((columnHeight - fixedHeight) / ROW_HEIGHT),
  );
}

// Page numbers to show, shortening long runs: 1 … 4 5 6 … 12.
export function pageItems(current: number, count: number): (number | "…")[] {
  const pages = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => from + index);
  if (count <= 7) return pages(1, count);
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  return [
    1,
    ...(start > 2 ? (["…"] as const) : []),
    ...pages(start, end),
    ...(end < count - 1 ? (["…"] as const) : []),
    count,
  ];
}

// The table's page size follows the height of the column beside it; once the
// columns stack, it is a fixed ten rows.
export function usePageSize(
  column: RefObject<HTMLElement | null>,
  card: RefObject<HTMLElement | null>,
  body: RefObject<HTMLElement | null>,
): number {
  const [size, setSize] = useState(MIN_ROWS);
  useEffect(() => {
    const narrow = window.matchMedia(NARROW);
    const update = () => {
      if (narrow.matches) {
        setSize(NARROW_ROWS);
      } else if (column.current && card.current && body.current) {
        const fixed = card.current.offsetHeight - body.current.offsetHeight;
        setSize(rowsFor(column.current.offsetHeight, fixed));
      }
    };
    const observer = new ResizeObserver(update);
    for (const element of [column.current, card.current])
      if (element) observer.observe(element);
    narrow.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      narrow.removeEventListener("change", update);
    };
  }, [column, card, body]);
  return size;
}
