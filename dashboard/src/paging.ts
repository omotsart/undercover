import { type RefObject, useEffect, useState } from "react";

export const ROW_HEIGHT = 44;
const MIN_ROWS = 8;
const NARROW_ROWS = 10;
const NARROW = "(max-width: 1200px)";

// Rows that fit in the height the table can have, never fewer than eight.
export function rowsFor(available: number): number {
  return Math.max(MIN_ROWS, Math.floor(available / ROW_HEIGHT) || 0);
}

// Where a column's own content ends. Its last card may be stretched to meet
// the other column; the room that stretch adds (inside .fill-body) is left
// out, so the table can shrink again when the column does.
export function contentBottom(column: HTMLElement): number {
  const bottom = column.getBoundingClientRect().bottom;
  const fill = column.querySelector(".fill-body");
  const first = fill?.firstElementChild;
  const last = fill?.lastElementChild;
  if (!fill || !first || !last) return bottom;
  const content =
    last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
  return bottom - (fill.getBoundingClientRect().height - content);
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

// From the top of the rows to the bottom of the right column's content, less
// the footer and the card's padding below it.
export function availableHeight(
  column: HTMLElement,
  card: HTMLElement,
  body: HTMLElement,
  footer: HTMLElement | null,
): number {
  const below =
    (footer?.offsetHeight ?? 0) +
    (parseFloat(getComputedStyle(card).paddingBottom) || 0);
  return contentBottom(column) - body.getBoundingClientRect().top - below;
}

type Box = RefObject<HTMLElement | null>;

// The table's page size: as many rows as the available height holds, measured
// again whenever either column changes size; a fixed ten once they stack.
export function usePageSize(
  main: Box,
  column: Box,
  card: Box,
  body: Box,
  footer: Box,
): number {
  const [size, setSize] = useState(MIN_ROWS);
  useEffect(() => {
    const narrow = window.matchMedia(NARROW);
    const update = () => {
      if (narrow.matches) setSize(NARROW_ROWS);
      else if (column.current && card.current && body.current)
        setSize(
          rowsFor(
            availableHeight(
              column.current,
              card.current,
              body.current,
              footer.current,
            ),
          ),
        );
    };
    const observer = new ResizeObserver(update);
    for (const box of [main.current, column.current])
      if (box) observer.observe(box);
    narrow.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      narrow.removeEventListener("change", update);
    };
  }, [main, column, card, body, footer]);
  return size;
}
