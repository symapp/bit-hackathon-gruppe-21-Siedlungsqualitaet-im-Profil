import type { PaddingOptions } from 'maplibre-gl';

const EDGE_MARGIN_PX = 8;
/** Extra inset so CH fits in the visible strip between overlays, not only their boxes. */
const UI_INSET_BUFFER_PX = 72;

/** Read pixel padding for map camera from overlay sidebars and search bar. */
export function readMapUiPadding(): PaddingOptions {
  if (typeof document === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const left = document.querySelector<HTMLElement>('.regions-sidebar');
  const right = document.querySelector<HTMLElement>('.sidebar');
  const search = document.querySelector<HTMLElement>('.search-container');

  const insetBuffer = EDGE_MARGIN_PX + UI_INSET_BUFFER_PX;
  const leftPad = left
    ? Math.max(0, Math.ceil(left.getBoundingClientRect().right) + insetBuffer)
    : 0;
  const rightPad = right
    ? Math.max(
        0,
        Math.ceil(window.innerWidth - right.getBoundingClientRect().left) + insetBuffer,
      )
    : 0;
  const bottomPad = search
    ? Math.max(
        0,
        Math.ceil(window.innerHeight - search.getBoundingClientRect().top) + insetBuffer,
      )
    : 0;

  if (leftPad === 0 && rightPad === 0 && bottomPad === 0) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  return {
    top: EDGE_MARGIN_PX,
    left: leftPad,
    right: rightPad,
    bottom: bottomPad,
  };
}

export function mapUiPaddingEquals(a: PaddingOptions, b: PaddingOptions): boolean {
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
}
