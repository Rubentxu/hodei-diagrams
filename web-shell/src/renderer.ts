import type { PageRender, PageToken, SlotmapId } from './types.js';

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
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  function applyTransform(): void {
    container.style.transform = `scale(${zoom}) translate(${panX}px, ${panY}px)`;
  }

  function setZoom(z: number): void {
    zoom = Math.max(0.1, Math.min(5, z));
    applyTransform();
  }

  function getZoom(): number {
    return zoom;
  }

  function resetView(): void {
    zoom = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function setPan(x: number, y: number): void {
    panX = x;
    panY = y;
    applyTransform();
  }

  function clientToDoc(clientX: number, clientY: number): { x: number; y: number } {
    const rect = viewer.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  }

  function fitToView(padding = 0.05): void {
    // Collect all shape bounding boxes from data-vertex-id elements
    const shapeEls = viewer.querySelectorAll('[data-vertex-id]');
    if (shapeEls.length === 0) {
      // No shapes — reset to default view
      resetView();
      return;
    }

    // Compute union bbox of all shapes in document (SVG) coordinate space.
    // We get screen bboxes and divide by current zoom to convert to doc coords,
    // since the viewer transform is scale(zoom) translate(panX, panY).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of shapeEls) {
      const r = el.getBoundingClientRect();
      const x = (r.left - viewer.getBoundingClientRect().left) / zoom;
      const y = (r.top - viewer.getBoundingClientRect().top) / zoom;
      const w = r.width / zoom;
      const h = r.height / zoom;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
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

    const containerRect = viewer.getBoundingClientRect();
    const availW = containerRect.width * (1 - padding * 2);
    const availH = containerRect.height * (1 - padding * 2);

    const newZoom = Math.max(0.1, Math.min(5, Math.min(availW / contentW, availH / contentH)));

    // Center content: pan so content center aligns with viewport center
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    const viewportCenterX = containerRect.width / 2;
    const viewportCenterY = containerRect.height / 2;

    const newPanX = viewportCenterX / newZoom - contentCenterX;
    const newPanY = viewportCenterY / newZoom - contentCenterY;

    zoom = newZoom;
    panX = newPanX;
    panY = newPanY;
    applyTransform();
    container.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoom } }));
  }

  // ─── Mouse wheel → zoom ───────────────────────────────────────────────────
  container.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(zoom + delta);
    // Dispatch a custom event so the UI can update the zoom display
    container.dispatchEvent(new CustomEvent('zoomchange', { detail: { zoom } }));
  }, { passive: false });

  // ─── Middle-click drag → pan ──────────────────────────────────────────────
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;

  function startPan(clientX: number, clientY: number): void {
    isPanning = true;
    panStartX = clientX;
    panStartY = clientY;
    panOriginX = panX;
    panOriginY = panY;
    container.classList.add('panning');
  }

  function doPan(clientX: number, clientY: number): void {
    if (!isPanning) return;
    panX = panOriginX + (clientX - panStartX) / zoom;
    panY = panOriginY + (clientY - panStartY) / zoom;
    applyTransform();
  }

  function endPan(): void {
    isPanning = false;
    container.classList.remove('panning');
  }

  // Middle mouse button
  container.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
    }
  });

  container.addEventListener('mousemove', (e: MouseEvent) => {
    if (isPanning) {
      doPan(e.clientX, e.clientY);
    }
  });

  // Listen on window for mouseup to catch releases outside container
  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 1 && isPanning) {
      endPan();
    }
  });

  // Prevent middle-click auto-scroll
  container.addEventListener('auxclick', (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  });

  return { setZoom, getZoom, resetView, setPan, clientToDoc, fitToView };
}
