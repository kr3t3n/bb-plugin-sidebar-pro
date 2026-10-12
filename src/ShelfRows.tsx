import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  measureElement,
  observeElementRect,
  useVirtualizer,
  type Rect,
  type Virtualizer,
} from "@tanstack/react-virtual";

/**
 * Below this many rows a shelf renders every row. Short lists stay plain DOM:
 * nothing to gain, and browser find and keyboard order keep working as usual.
 */
export const VIRTUALIZE_MIN_ROWS = 60;

/** One screen of sidebar, used until the scroll container has a real size. */
const FALLBACK_RECT: Rect = { width: 280, height: 1000 };

/** Where a virtualised row sits. Empty for a plain row. */
export interface RowPlacement {
  /** Offset from the top of the shelf list, in pixels. */
  top?: number;
  index?: number;
  measureRef?: (node: Element | null) => void;
}

/** Positioning props for a row's `<li>`. Empty for a plain row. */
export function placementProps(placement: RowPlacement) {
  if (placement.top === undefined) return {};
  return {
    ref: placement.measureRef,
    "data-index": placement.index,
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      transform: `translateY(${placement.top}px)`,
    },
  } as const;
}

// A sidebar that is hidden, or not laid out yet, reports a zero height. Treat
// that as one screen, so the first paint has rows rather than an empty list.
function observeRectWithFallback(
  instance: Virtualizer<HTMLElement, Element>,
  cb: (rect: Rect) => void,
) {
  return observeElementRect(instance, (rect) =>
    cb(rect.height > 0 ? rect : FALLBACK_RECT),
  );
}

export function ShelfRows<T extends { id: string }>({
  items,
  rowHeight,
  scrollRef,
  layoutKey = "",
  renderRow,
}: {
  items: readonly T[];
  /** Expected row height; rows are measured once they render. */
  rowHeight: number;
  /**
   * Changes when a shelf appears or goes above this one. The list then reads
   * its offset again; size changes above it are observed without help.
   */
  layoutKey?: string;
  /**
   * The sidebar's scrolling container, shared by every shelf. A ref, not the
   * element: the container mounts in the same commit as the first rows, and
   * the virtualiser reads it after that commit.
   */
  scrollRef: RefObject<HTMLElement | null>;
  renderRow: (item: T, placement: RowPlacement) => ReactNode;
}) {
  if (items.length < VIRTUALIZE_MIN_ROWS) {
    return (
      <ul className="flex flex-col gap-px">
        {items.map((item) => renderRow(item, {}))}
      </ul>
    );
  }
  return (
    <VirtualRows
      items={items}
      rowHeight={rowHeight}
      scrollRef={scrollRef}
      layoutKey={layoutKey}
      renderRow={renderRow}
    />
  );
}

function VirtualRows<T extends { id: string }>({
  items,
  rowHeight,
  scrollRef,
  layoutKey,
  renderRow,
}: {
  items: readonly T[];
  rowHeight: number;
  scrollRef: RefObject<HTMLElement | null>;
  layoutKey: string;
  renderRow: (item: T, placement: RowPlacement) => ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // Shelves above this one (pinned, headers) push it down the shared scroll
  // container. The virtualiser needs that offset to know which rows show.
  // Reading it forces a style pass, so it is read when the content above
  // changes size, never on an ordinary render such as a scroll.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    const scrollElement = scrollRef.current;
    if (list === null || scrollElement === null) return;
    // The scroll container is positioned, so offsetTop is the distance from
    // the top of the scrolled content.
    const update = () => {
      const margin = list.offsetTop;
      setScrollMargin((current) =>
        Math.abs(current - margin) > 0.5 ? margin : current,
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    for (
      let node: Element | null = list;
      node !== null && node !== scrollElement;
      node = node.parentElement
    ) {
      for (
        let sibling = node.previousElementSibling;
        sibling !== null;
        sibling = sibling.previousElementSibling
      ) {
        observer.observe(sibling);
      }
    }
    return () => observer.disconnect();
  }, [layoutKey, scrollRef]);

  // Stable options. A new getItemKey on each render makes the virtualiser
  // rebuild the position of every row, thousands of them, on every scroll.
  const getItemKey = useCallback((index: number) => items[index]!.id, [items]);
  const estimateSize = useCallback(() => rowHeight, [rowHeight]);
  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);
  // A hidden sidebar measures every row as 0px. Taken at face value, every
  // row would then fit on screen and the whole list would render.
  const measureRow = useCallback(
    (
      element: Element,
      entry: ResizeObserverEntry | undefined,
      instance: Virtualizer<HTMLElement, Element>,
    ) => {
      const size = measureElement(element, entry, instance);
      return size > 0 ? size : rowHeight;
    },
    [rowHeight],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: 8,
    gap: 1,
    scrollMargin,
    initialRect: FALLBACK_RECT,
    observeElementRect: observeRectWithFallback,
    measureElement: measureRow,
  });

  return (
    <ul
      ref={listRef}
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) =>
        renderRow(items[row.index]!, {
          top: row.start - scrollMargin,
          index: row.index,
          measureRef: virtualizer.measureElement,
        }),
      )}
    </ul>
  );
}
