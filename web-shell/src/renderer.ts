import type { PageRender, PageToken, SlotmapId } from './types.js';
import { Viewport } from './viewport.js';

/**
 * Mount an SVG string into a container.
 * Only engine-returned SVG strings reach innerHTML (engine is the trust boundary).
 */
export function mountSvg(container: HTMLElement, svg: string): void {
  if (!svg || svg.trim() === '') {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = svg;
}

export function showPage(
  pages: ReadonlyArray<PageRender>,
  token: PageToken,
  container: HTMLElement,
): boolean {
  const page = pages.find((p) => p.pageId === token);
  if (!page) return false;
  mountSvg(container, page.svg);
  return true;
}

export function clear(container: HTMLElement): void {
  container.innerHTML = '';
}

/**
 * Apply or clear the `.selected` CSS class on elements with `data-vertex-id`.
 * Called after re-render to restore selection highlight.
 */
export function applySelectionClass(viewer: HTMLElement, id: SlotmapId | null): void {
  // Remove .selected from all elements
  viewer.querySelectorAll('[data-vertex-id]').forEach((el) => {
    el.classList.remove('selected');
  });
  if (id !== null) {
    const selector = `[data-vertex-id="${id.idx}:${id.version}"]`;
    const el = viewer.querySelector(selector);
    if (el) {
      el.classList.add('selected');
    }
  }
}

// ─── Zoom / Pan ───────────────────────────────────────────────────────────────

export interface ZoomPanControls {
  /** Set the current zoom level (clamped 0.1–5). */
  setZoom(_z: number): void;
  /** Get the current zoom level. */
  getZoom(): number;
  /** Reset zoom to 1x and pan to (0,0). */
  resetView(): void;
  /** Set pan offset in CSS pixels. */
  setPan(_x: number, _y: number): void;
  /** Convert screen client coordinates to document-space coordinates. */
  clientToDoc(_clientX: number, _clientY: number): { x: number; y: number };
  /**
   * Zoom and pan so all shapes fit within the viewport.
   * Uses 5% viewport margin by default. Safe no-op when viewer is empty.
   */
  fitToView(_padding?: number): void;
  /** Pan viewport by a delta in pre-scale (pan-space) pixels. */
  panBy(_dx: number, _dy: number): void;
  /**
   * Re-apply the current viewport state to the SVG element.
   * Call this after the SVG innerHTML is replaced (e.g., after mountSvg or #replay).
   */
  applyViewport(): void;
  /** The underlying Viewport instance for direct manipulation. */
  viewport: Viewport;
}

/**
 * Set up zoom and pan controls on a canvas container.
 *
 * @param container The `.canvas-container` element that receives CSS transforms.
 * @param viewer The `.viewer` element (child of container) used for coordinate conversion.
 */
export function setupZoomPan(
  container: HTMLElement,
  viewer: HTMLElement,
): ZoomPanControls {
  // Viewport manages zoom/pan state and applies to SVG viewBox
  // We use Viewport.fromInitial and then sync via withZoom/withPan
  let viewport = Viewport.fromInitial(1024, 768);

  // Get the SVG element (created by mountSvg)
  function getSvg(): SVGSVGElement | null {
    return viewer.querySelector('svg') as SVGSVGElement | null;
  }

  // Apply current viewport state to SVG viewBox
  function applyViewport(): void {
    const svg = getSvg();
    if (svg) {
      viewport.applyToSvgElement(svg);
    }
  }

  // Initialize viewport with actual viewer dimensions and apply
  function initViewport(): void {
    const rect = viewer.getBoundingClientRect();
    viewport.setSize(rect.width, rect.height);
    applyViewport();
  }

  function setZoom(z: number): void {
    const svg = getSvg();
    if (!svg) return;
    viewport.setZoom(z);
    applyViewport();
    container.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoom: viewport.zoom } }));
  }

  function getZoom(): number {
    return viewport.zoom;
  }

  function resetView(): void {
    viewport.setPan(0, 0);
    viewport.setZoom(1.0);
    applyViewport();
    container.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoom: viewport.zoom } }));
  }

  function setPan(x: number, y: number): void {
    viewport.setPan(x, y);
    applyViewport();
  }

  function clientToDoc(clientX: number, clientY: number): { x: number; y: number } {
    const svg = getSvg();
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return viewport.clientToDoc(clientX, clientY, rect);
  }

  function fitToView(padding = 0.05): void {
    const svg = getSvg();
    if (!svg) return;

    // Collect all shape bounding boxes from data-vertex-id elements
    const shapeEls = viewer.querySelectorAll('[data-vertex-id]');
    if (shapeEls.length === 0) {
      // No shapes — reset to default view
      resetView();
      return;
    }

    const svgRect = svg.getBoundingClientRect();

    // Compute union bbox of all shapes in document (SVG) coordinate space.
    // Use viewport's clientToDoc to properly convert client coords to doc coords.
    // The scale factor accounts for CSS pixel size vs viewport size:
    //   docWidth = cssWidth * (viewport.width / svgRect.width) / viewport.zoom
    const scaleX = viewport.width / svgRect.width;
    const scaleY = viewport.height / svgRect.height;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of Array.from(shapeEls)) {
      const r = el.getBoundingClientRect();
      // Convert center of element to doc coords
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;
      const doc = viewport.clientToDoc(centerX, centerY, svgRect);
      const w = r.width * scaleX / viewport.zoom;
      const h = r.height * scaleY / viewport.zoom;
      if (doc.x - w / 2 < minX) minX = doc.x - w / 2;
      if (doc.y - h / 2 < minY) minY = doc.y - h / 2;
      if (doc.x + w / 2 > maxX) maxX = doc.x + w / 2;
      if (doc.y + h / 2 > maxY) maxY = doc.y + h / 2;
    }

    if (minX === Infinity) {
      resetView();
      return;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) {
      resetView();
      return;
    }

    const bounds = { x: minX, y: minY, width: contentW, height: contentH };
    const newVp = Viewport.fromRect(bounds, viewport.width, viewport.height, padding);
    viewport.setPan(newVp.panX, newVp.panY);
    viewport.setZoom(newVp.zoom);
    applyViewport();
    container.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoom: viewport.zoom } }));
  }

  function panBy(dx: number, dy: number): void {
    viewport.panBy(dx, dy);
    applyViewport();
  }

  // Initialize viewport dimensions on setup
  initViewport();

  // ─── Wheel: pan by default, Ctrl/Cmd+wheel = zoom, Shift+wheel = horizontal ──
  container.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const svg = getSvg();
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd + wheel → zoom centered on cursor
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = viewport.zoom + delta;
      viewport.zoomAround(newZoom, e.clientX, e.clientY, svgRect);
      applyViewport();
      container.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoom: viewport.zoom } }));
    } else if (e.shiftKey) {
      // Shift + wheel → horizontal pan
      const dx = -e.deltaY / viewport.zoom;
      viewport.panBy(dx, 0);
      applyViewport();
    } else {
      // Plain wheel → vertical pan (draw.io parity)
      const dy = -e.deltaY / viewport.zoom;
      viewport.panBy(0, dy);
      applyViewport();
    }
  }, { passive: false });

  // ─── Pan: middle-click drag, right-click drag, Space+drag ──────────────────
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let spacePressed = false;
  let rightClickMoved = false;

  function startPan(clientX: number, clientY: number): void {
    isPanning = true;
    panStartX = clientX;
    panStartY = clientY;
    panOriginX = viewport.panX;
    panOriginY = viewport.panY;
    container.classList.add('panning');
  }

  function doPan(clientX: number, clientY: number): void {
    if (!isPanning) return;
    const dx = (clientX - panStartX) / viewport.zoom;
    const dy = (clientY - panStartY) / viewport.zoom;
    viewport.setPan(panOriginX + dx, panOriginY + dy);
    applyViewport();
  }

  function endPan(): void {
    isPanning = false;
    container.classList.remove('panning');
  }

  // Track Space key for Space+drag pan
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat) {
      // Don't activate when typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      spacePressed = true;
      container.style.cursor = 'grab';
    }
  });

  document.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spacePressed = false;
      container.style.cursor = '';
    }
  });

  // Middle mouse button OR right-click OR Space+drag → pan
  container.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button === 1) {
      // Middle-click → pan
      e.preventDefault();
      startPan(e.clientX, e.clientY);
    } else if (e.button === 2) {
      // Right-click → potential pan (start tracking)
      rightClickMoved = false;
      startPan(e.clientX, e.clientY);
    } else if (e.button === 0 && spacePressed) {
      // Left-click with Space held → pan
      e.preventDefault();
      startPan(e.clientX, e.clientY);
    }
  });

  container.addEventListener('mousemove', (e: MouseEvent) => {
    if (isPanning) {
      if (e.buttons === 2 || (e.buttons & 2)) rightClickMoved = true;
      doPan(e.clientX, e.clientY);
    }
  });

  // Listen on window for mouseup to catch releases outside container
  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 1 && isPanning) {
      endPan();
    } else if (e.button === 2 && isPanning) {
      endPan();
    } else if (e.button === 0 && isPanning && spacePressed) {
      endPan();
    }
  });

  // Suppress context menu if right-click was used for panning
  container.addEventListener('contextmenu', (e: MouseEvent) => {
    if (rightClickMoved) {
      e.preventDefault();
      e.stopPropagation();
      rightClickMoved = false;
    }
  });

  // Prevent middle-click auto-scroll
  container.addEventListener('auxclick', (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  });

  return { setZoom, getZoom, resetView, setPan, clientToDoc, fitToView, panBy, applyViewport, viewport };
}
