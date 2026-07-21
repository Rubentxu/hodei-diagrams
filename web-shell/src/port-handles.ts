/**
 * port-handles.ts — Port handle overlay for connection-point editing.
 *
 * Renders small draggable circles at the perimeter anchor points of selected edges.
 * Handles are only visible when the edge is selected (less visual noise).
 *
 * UX: Re-anchor = direct drag of the handle (no modal, no click-then-edit).
 */

import type { SlotmapId, ScenePage } from './types.js';
import type { DiagramEngineSession } from './session.js';
import { sceneBounds } from './scene-bounds.js';
import { } from './types.js';

/** Anchor specification compatible with the WASM interface. */
export interface AnchorSpec {
  kind: 'auto' | 'north' | 'south' | 'east' | 'west' | 'normalized';
  nx?: number;
  ny?: number;
}

/** Shape bounds in document coordinates. */
interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An anchor handle being dragged. */
interface DragHandle {
  edgeId: SlotmapId;
  end: 0 | 1; // 0 = source, 1 = target
  vertexId: SlotmapId;
  shapeBounds: ShapeBounds;
  handleEl: SVGCircleElement;
  startMouseX: number;
  startMouseY: number;
}

/** State for Shift-axis-constrained drag. */
interface ShiftDragState {
  axis: 'H' | 'V' | null;
  locked: boolean;
}

/**
 * Port handle overlay: renders draggable anchor handles on selected edges.
 *
 * Handles are small circles (radius 5px) at the perimeter of the source/target
 * shapes. They are only visible when the parent edge is selected.
 *
 * Hit-test radius is 12px (distinct from bend handles which use parametric
 * positions along the polyline).
 */
export class PortHandlesOverlay {
  readonly #svgLayer: HTMLElement;
  readonly #sceneProvider: () => ScenePage[];
  readonly #session: DiagramEngineSession;
  #dragHandle: DragHandle | null = null;
  #shiftDragState: ShiftDragState = { axis: null, locked: false };
  #onMoveBound: (_e: PointerEvent) => void;
  #onUpBound: (_e: PointerEvent) => void;

  constructor(
    svgLayer: HTMLElement,
    sceneProvider: () => ScenePage[],
    session: DiagramEngineSession,
  ) {
    this.#svgLayer = svgLayer;
    this.#sceneProvider = sceneProvider;
    this.#session = session;
    this.#onMoveBound = (e: PointerEvent) => this.#onDragMove(e);
    this.#onUpBound = (e: PointerEvent) => this.#onDragEnd(e);
  }

  /**
   * Render port handles for all selected edges.
   * @param selection Set of selected edge SlotmapIds
   */
  render(selection: Set<SlotmapId>): void {
    // Remove existing handles
    this.#svgLayer.querySelectorAll('.port-handle').forEach((el) => el.remove());

    if (selection.size === 0) return;

    const scene = this.#sceneProvider();
    if (scene.length === 0) return;

    for (const edgeId of selection) {
      const edgeData = this.#findEdgeInScene(scene, edgeId);
      if (!edgeData) continue;

      const { sourceId, targetId } = edgeData;
      const sourceBounds = this.#findShapeBounds(scene, sourceId);
      const targetBounds = this.#findShapeBounds(scene, targetId);

      if (!sourceBounds || !targetBounds) continue;

      // Compute anchor positions
      const sourcePos = this.#computeAnchorPosition(sourceBounds, targetBounds);
      const targetPos = this.#computeAnchorPosition(targetBounds, sourceBounds);

      // Source handle
      this.#createHandle(edgeId, 0, sourceId, sourceBounds, sourcePos.x, sourcePos.y);
      // Target handle
      this.#createHandle(edgeId, 1, targetId, targetBounds, targetPos.x, targetPos.y);
    }
  }

  /**
   * Create a single port handle circle element.
   */
  #createHandle(
    edgeId: SlotmapId,
    end: 0 | 1,
    vertexId: SlotmapId,
    shapeBounds: ShapeBounds,
    anchorX: number,
    anchorY: number,
  ): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(anchorX));
    circle.setAttribute('cy', String(anchorY));
    circle.setAttribute('r', '5');
    circle.setAttribute('class', 'port-handle');
    circle.setAttribute('data-edge-idx', String(edgeId.idx));
    circle.setAttribute('data-edge-version', String(edgeId.version));
    circle.setAttribute('data-end', String(end));
    circle.setAttribute('fill', '#4a9eff');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '1.5');
    circle.style.cursor = 'grab';
    circle.style.pointerEvents = 'all';

    // Mousedown initiates drag
    circle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.#startDrag(edgeId, end, vertexId, shapeBounds, circle, e.clientX, e.clientY);
    });

    this.#svgLayer.appendChild(circle);
  }

  /**
   * Start dragging a port handle.
   */
  #startDrag(
    edgeId: SlotmapId,
    end: 0 | 1,
    vertexId: SlotmapId,
    shapeBounds: ShapeBounds,
    handleEl: SVGCircleElement,
    clientX: number,
    clientY: number,
  ): void {
    this.#dragHandle = {
      edgeId,
      end,
      vertexId,
      shapeBounds,
      handleEl,
      startMouseX: clientX,
      startMouseY: clientY,
    };

    this.#shiftDragState = { axis: null, locked: false };

    handleEl.style.cursor = 'grabbing';
    document.addEventListener('pointermove', this.#onMoveBound);
    document.addEventListener('pointerup', this.#onUpBound);
  }

  /**
   * Handle pointer move during a port drag.
   */
  #onDragMove(e: PointerEvent): void {
    if (!this.#dragHandle) return;

    const { shapeBounds, handleEl, startMouseX, startMouseY } = this.#dragHandle;

    // Get current document position from client
    const rect = this.#svgLayer.getBoundingClientRect();
    const zoom = this.#getZoom();
    let docX = (e.clientX - rect.left) / zoom;
    let docY = (e.clientY - rect.top) / zoom;

    // Apply Shift-axis constraint: after 3px, lock to dominant axis (H or V)
    if (e.shiftKey) {
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!this.#shiftDragState.locked) {
        const THRESHOLD = 3;
        if (absDx > THRESHOLD || absDy > THRESHOLD) {
          this.#shiftDragState.axis = absDx >= absDy ? 'H' : 'V';
          this.#shiftDragState.locked = true;
        }
      }

      if (this.#shiftDragState.locked) {
        if (this.#shiftDragState.axis === 'H') {
          // Lock vertical: keep docY at start position
          const startDocY = (startMouseY - rect.top) / zoom;
          docY = this.#projectOntoPerimeter(shapeBounds, docX, startDocY).y;
        } else {
          // Lock horizontal: keep docX at start position
          const startDocX = (startMouseX - rect.left) / zoom;
          docX = this.#projectOntoPerimeter(shapeBounds, startDocX, docY).x;
        }
      }
    }

    // Compute the perimeter anchor position (clamped to shape bounds)
    const anchorPos = this.#projectOntoPerimeter(shapeBounds, docX, docY);

    // Update handle visual position
    handleEl.setAttribute('cx', String(anchorPos.x));
    handleEl.setAttribute('cy', String(anchorPos.y));
  }

  /**
   * Handle pointer up to end port drag.
   */
  #onDragEnd(e: PointerEvent): void {
    if (!this.#dragHandle) return;

    const { edgeId, end, shapeBounds, handleEl, startMouseX, startMouseY } = this.#dragHandle;

    document.removeEventListener('pointermove', this.#onMoveBound);
    document.removeEventListener('pointerup', this.#onUpBound);

    // Check if drag actually moved (threshold)
    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    handleEl.style.cursor = 'grab';
    handleEl.setAttribute('fill', '#4a9eff');

    if (dist < 3) {
      // Small movement, cancel
      this.#dragHandle = null;
      return;
    }

    // Get final document position
    const rect = this.#svgLayer.getBoundingClientRect();
    const zoom = this.#getZoom();
    const docX = (e.clientX - rect.left) / zoom;
    const docY = (e.clientY - rect.top) / zoom;

    // Compute normalized anchor
    const { nx, ny } = this.#computePerimeterNormalized(shapeBounds, docX, docY);
    const anchorKind = this.classifyAnchorFromNormalized(nx, ny);

    // Call WASM to set the anchor
    const anchor: AnchorSpec =
      anchorKind === 'normalized'
        ? { kind: 'normalized', nx, ny }
        : { kind: anchorKind };

    const result = this.#session.setEdgeAnchor(edgeId, end, anchor);
    if (!result.ok) {
      console.error('[port-handles] Failed to set edge anchor:', result.error);
    }

    this.#dragHandle = null;
    this.#shiftDragState = { axis: null, locked: false };
  }

  /**
   * Compute the perimeter anchor position for an edge endpoint.
   * Returns the point on the shape perimeter closest to the other shape's center.
   */
  #computeAnchorPosition(
    bounds: ShapeBounds,
    otherBounds: ShapeBounds,
  ): { x: number; y: number } {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const otherCenterX = otherBounds.x + otherBounds.width / 2;
    const otherCenterY = otherBounds.y + otherBounds.height / 2;

    const dx = otherCenterX - centerX;
    const dy = otherCenterY - centerY;

    // Find which side to use based on direction to other shape
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal: exit east or west
      if (dx > 0) {
        return { x: bounds.x + bounds.width, y: centerY };
      } else {
        return { x: bounds.x, y: centerY };
      }
    } else {
      // Vertical: exit north or south
      if (dy > 0) {
        return { x: centerX, y: bounds.y + bounds.height };
      } else {
        return { x: centerX, y: bounds.y };
      }
    }
  }

  /**
   * Project a mouse point onto the rectangle perimeter, returning normalized
   * (0-1) coordinates relative to the source point on that perimeter.
   *
   * If the projected point is outside the perimeter projection, returns the
   * closest point on the perimeter.
   */
  computePerimeterNormalized(
    shapeBounds: ShapeBounds,
    mouseX: number,
    mouseY: number,
  ): { nx: number; ny: number } {
    return this.#computePerimeterNormalized(shapeBounds, mouseX, mouseY);
  }

  #computePerimeterNormalized(
    bounds: ShapeBounds,
    mouseX: number,
    mouseY: number,
  ): { nx: number; ny: number } {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const hw = bounds.width / 2;
    const hh = bounds.height / 2;

    // Direction from center to mouse
    const dx = mouseX - cx;
    const dy = mouseY - cy;

    // Determine which side we exit
    let anchorX: number;
    let anchorY: number;
    let nx: number;
    let ny: number;

    if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
      // Exiting left or right
      if (dx > 0) {
        anchorX = bounds.x + bounds.width;
        anchorY = cy + (dy / Math.abs(dx || 1)) * hw;
        anchorY = Math.max(bounds.y, Math.min(bounds.y + bounds.height, anchorY));
        nx = 1.0;
        ny = (anchorY - bounds.y) / bounds.height;
      } else {
        anchorX = bounds.x;
        anchorY = cy - (dy / Math.abs(dx || 1)) * hw;
        anchorY = Math.max(bounds.y, Math.min(bounds.y + bounds.height, anchorY));
        nx = 0.0;
        ny = (anchorY - bounds.y) / bounds.height;
      }
    } else {
      // Exiting top or bottom
      if (dy > 0) {
        anchorY = bounds.y + bounds.height;
        anchorX = cx + (dx / Math.abs(dy || 1)) * hh;
        anchorX = Math.max(bounds.x, Math.min(bounds.x + bounds.width, anchorX));
        ny = 1.0;
        nx = (anchorX - bounds.x) / bounds.width;
      } else {
        anchorY = bounds.y;
        anchorX = cx - (dx / Math.abs(dy || 1)) * hh;
        anchorX = Math.max(bounds.x, Math.min(bounds.x + bounds.width, anchorX));
        ny = 0.0;
        nx = (anchorX - bounds.x) / bounds.width;
      }
    }

    // Clamp to [0, 1]
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));

    return { nx, ny };
  }

  /**
   * Classify an anchor from normalized (0-1) coordinates.
   * If within 5% of a cardinal axis, return that cardinal.
   * Otherwise return "normalized".
   */
  classifyAnchorFromNormalized(nx: number, ny: number): 'north' | 'south' | 'east' | 'west' | 'normalized' {
    const threshold = 0.05;
    if (ny <= threshold) return 'north';
    if (ny >= 1 - threshold) return 'south';
    if (nx >= 1 - threshold) return 'east';
    if (nx <= threshold) return 'west';
    return 'normalized';
  }

  /** Project a mouse point onto the perimeter of a rectangle. */
  #projectOntoPerimeter(
    bounds: ShapeBounds,
    mouseX: number,
    mouseY: number,
  ): { x: number; y: number } {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const hw = bounds.width / 2;
    const hh = bounds.height / 2;

    // Direction from center to mouse
    const dx = mouseX - cx;
    const dy = mouseY - cy;

    // Avoid division by zero
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let anchorX: number;
    let anchorY: number;

    // Determine exit side
    if (absDx * hh > absDy * hw) {
      // Exits left or right
      if (dx > 0) {
        anchorX = bounds.x + bounds.width;
        anchorY = cy + (dy / absDx) * hw;
      } else {
        anchorX = bounds.x;
        anchorY = cy - (dy / absDx) * hw;
      }
    } else {
      // Exits top or bottom
      if (dy > 0) {
        anchorY = bounds.y + bounds.height;
        anchorX = cx + (dx / absDy) * hh;
      } else {
        anchorY = bounds.y;
        anchorX = cx - (dx / absDy) * hh;
      }
    }

    // Clamp to bounds
    anchorX = Math.max(bounds.x, Math.min(bounds.x + bounds.width, anchorX));
    anchorY = Math.max(bounds.y, Math.min(bounds.y + bounds.height, anchorY));

    return { x: anchorX, y: anchorY };
  }

  /** Find an edge in the scene and return its source/target IDs. */
  #findEdgeInScene(
    scene: ScenePage[],
    edgeId: SlotmapId,
  ): { sourceId: SlotmapId; targetId: SlotmapId } | null {
    for (const page of scene) {
      for (const elem of page.display_list) {
        const e = elem as Record<string, unknown>;
        // Check for LineElement
        const line = e['Line'] as Record<string, unknown> | undefined;
        if (line) {
          const idField = line['id'] as { idx?: number; version?: number } | undefined;
          if (idField?.idx === edgeId.idx && idField?.version === edgeId.version) {
            const source = line['source'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            const target = line['target'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            if (source?.Vertex && target?.Vertex) {
              return {
                sourceId: { idx: source.Vertex.idx!, version: source.Vertex.version! },
                targetId: { idx: target.Vertex.idx!, version: target.Vertex.version! },
              };
            }
          }
        }
        // Check for PathElement
        const path = e['Path'] as Record<string, unknown> | undefined;
        if (path) {
          const idField = path['id'] as { idx?: number; version?: number } | undefined;
          if (idField?.idx === edgeId.idx && idField?.version === edgeId.version) {
            const source = path['source'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            const target = path['target'] as { Vertex?: { idx?: number; version?: number } } | undefined;
            if (source?.Vertex && target?.Vertex) {
              return {
                sourceId: { idx: source.Vertex.idx!, version: source.Vertex.version! },
                targetId: { idx: target.Vertex.idx!, version: target.Vertex.version! },
              };
            }
          }
        }
      }
    }
    return null;
  }

  /** Find a shape's bounds in the scene. */
  #findShapeBounds(scene: ScenePage[], shapeId: SlotmapId): ShapeBounds | null {
    return sceneBounds(scene, shapeId);
  }

  /** Get current zoom level from the SVG layer's transform. */
  #getZoom(): number {
    const style = this.#svgLayer.style.transform;
    const match = style.match(/scale\(([^)]+)\)/);
    if (match) {
      return parseFloat(match[1]!) || 1;
    }
    return 1;
  }

  /** Clean up event listeners. Call when editor is detached. */
  dispose(): void {
    document.removeEventListener('pointermove', this.#onMoveBound);
    document.removeEventListener('pointerup', this.#onUpBound);
    this.#dragHandle = null;
    this.#svgLayer.querySelectorAll('.port-handle').forEach((el) => el.remove());
  }
}
