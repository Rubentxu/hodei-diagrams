#!/usr/bin/env python3
"""
generate-large-fixtures.py — Generate synthetic .drawio fixtures at scale.

Creates:
  - large-1k.drawio  (1 000 shapes)
  - large-5k.drawio  (5 000 shapes)
  - large-10k.drawio (10 000 shapes)

Each fixture is a minimal draw.io XML with:
  - Simple rectangular vertices arranged in a grid
  - ~20% edges connecting adjacent shapes
  - No styles for simplicity (faster parse)
"""

import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR.parent / "public" / "fixtures"


def generate_grid(cols: int, rows: int, cell_w: float = 120.0, cell_h: float = 60.0) -> list[tuple[int, float, float]]:
    """Return list of (cell_id, x, y)."""
    cells = []
    cid = 2  # 0=root, 1=default parent
    for r in range(rows):
        for c in range(cols):
            x = 20.0 + c * cell_w
            y = 20.0 + r * cell_h
            cells.append((cid, x, y))
            cid += 1
    return cells


def build_drawio(cells: list[tuple[int, float, float]], edge_fraction: float = 0.2) -> str:
    """
    Build a minimal mxfile with the given cells.
    cells: list of (id, x, y)
    edge_fraction: fraction of adjacent pairs to connect with edges
    """
    lines = ['<mxfile>', '  <diagram>', '    <mxGraphModel>', '      <root>', '        <mxCell id="0"/>', '        <mxCell id="1" parent="0"/>']

    # Vertices
    for cid, x, y in cells:
            lines.append(
            f'        <mxCell id="{cid}" parent="1" vertex="1">'
            f'<mxGeometry x="{x:.1f}" y="{y:.1f}" width="80" height="40" as="geometry"/>'
            f'</mxCell>'
        )

    # Edges: connect adjacent cells in row-major order
    # Build a lookup: (row, col) -> cell_id
    rows_count = int(max(c for _, _, c in [(0, 0, 0)] + [(cid, x, y) for cid, x, y in cells]) ** 0.5) + 1
    cols_count = rows_count
    # Actually compute proper dims from len(cells)
    n = len(cells)
    import math
    cols_count = math.ceil(math.sqrt(n))
    rows_count = math.ceil(n / cols_count)

    cell_map: dict[tuple[int, int], int] = {}
    for idx, (cid, x, y) in enumerate(cells):
        row = idx // cols_count
        col = idx % cols_count
        cell_map[(row, col)] = cid

    edge_id = cells[-1][0] + 1
    edges_added = 0
    total_pairs = 0

    for idx, (cid, _, _) in enumerate(cells):
        row = idx // cols_count
        col = idx % cols_count

        # Right neighbor
        if col + 1 < cols_count and idx + 1 < n:
            total_pairs += 1
            if edges_added < int(total_pairs * edge_fraction) + 1 or edge_fraction >= 1.0:
                target_cid = cell_map.get((row, col + 1))
                if target_cid:
                    lines.append(
                        f'        <mxCell id="{edge_id}" parent="1" edge="1" source="{cid}" target="{target_cid}">'
                        f'<mxGeometry relative="1" as="geometry"/>'
                        f'</mxCell>'
                    )
                    edge_id += 1
                    edges_added += 1

        # Bottom neighbor
        if row + 1 < rows_count and idx + cols_count < n:
            total_pairs += 1
            if edges_added < int(total_pairs * edge_fraction) + 1 or edge_fraction >= 1.0:
                target_cid = cell_map.get((row + 1, col))
                if target_cid:
                    lines.append(
                        f'        <mxCell id="{edge_id}" parent="1" edge="1" source="{cid}" target="{target_cid}">'
                        f'<mxGeometry relative="1" as="geometry"/>'
                        f'</mxCell>'
                    )
                    edge_id += 1
                    edges_added += 1

    lines.extend(['      </root>', '    </mxGraphModel>', '  </diagram>', '</mxfile>'])
    return '\n'.join(lines)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    configs = [
        (1000, "large-1k.drawio"),
        (5000, "large-5k.drawio"),
        (10000, "large-10k.drawio"),
    ]

    for target_count, filename in configs:
        print(f"Generating {filename} (~{target_count} shapes)...")

        # Find grid dimensions
        import math
        cols = math.ceil(math.sqrt(target_count))
        rows = math.ceil(target_count / cols)

        # Generate exactly target_count cells
        cells = []
        cid = 2
        for r in range(rows):
            for c in range(cols):
                if len(cells) >= target_count:
                    break
                x = 20.0 + c * 120.0
                y = 20.0 + r * 60.0
                cells.append((cid, x, y))
                cid += 1
            if len(cells) >= target_count:
                break

        xml = build_drawio(cells, edge_fraction=0.2)
        out_path = OUTPUT_DIR / filename
        out_path.write_text(xml, encoding="utf-8")

        size_kb = out_path.stat().st_size / 1024
        print(f"  -> {out_path} ({size_kb:.1f} KB, {len(cells)} cells)")

    print("\nDone.")


if __name__ == "__main__":
    main()
