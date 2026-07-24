//! SVG culling benchmarks using criterion.
//!
//! Run with: `cargo bench -p diagram-render-svg culling`

use criterion::{BenchmarkId, Criterion, black_box, criterion_group, criterion_main};
use diagram_core::VertexId;
use diagram_core::geometry::{Point, Rect, Size};
use diagram_render_svg::SvgRenderer;
use diagram_scene::{PageId, RectElement, ResolvedStyle, Scene, VisualElement};

fn make_rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
    Rect {
        origin: Point { x, y },
        size: Size {
            width: w,
            height: h,
        },
    }
}

fn make_rect_elem(x: f64, y: f64, w: f64, h: f64) -> VisualElement {
    VisualElement::Rect(RectElement {
        id: VertexId::default(),
        bounds: make_rect(x, y, w, h),
        rotation: 0.0,
        flip_h: false,
        flip_v: false,
        style: ResolvedStyle::default(),
    })
}

/// Create a scene with `count` randomly-placed rectangles in a large coordinate space.
fn make_scene(count: usize, spread: f64) -> Scene {
    let page = diagram_scene::PageScene {
        page_id: PageId::default(),
        name: "Bench".to_owned(),
        width: 10000.0,
        height: 10000.0,
        display_list: (0..count)
            .map(|i| {
                let x = (i as f64 * 7.3) % spread;
                let y = (i as f64 * 11.7) % spread;
                make_rect_elem(x, y, 50.0, 50.0)
            })
            .collect(),
        background: None,
        math_enabled: false,
    };
    Scene { pages: vec![page] }
}

fn bench_culling(c: &mut Criterion) {
    let counts = [100, 500, 1000, 5000, 10000];
    let spread = 100_000.0; // Elements scattered over 100k x 100k space
    let viewport = make_rect(0.0, 0.0, 1000.0, 1000.0); // Small viewport

    // Pre-build scenes so we measure render time, not scene construction
    let scenes: Vec<_> = counts.iter().map(|&c| make_scene(c, spread)).collect();

    let mut group = c.benchmark_group("render_svg_culled");

    for (idx, &count) in counts.iter().enumerate() {
        group.bench_with_input(BenchmarkId::new("culled", count), &count, |b, &_| {
            let scene = &scenes[idx];
            let renderer = SvgRenderer::new();
            b.iter(|| {
                let svg = renderer
                    .render(black_box(scene), PageId::default(), Some(viewport))
                    .unwrap();
                black_box(svg.len());
            });
        });
    }

    for (idx, &count) in counts.iter().enumerate() {
        group.bench_with_input(BenchmarkId::new("full", count), &count, |b, &_| {
            let scene = &scenes[idx];
            let renderer = SvgRenderer::new();
            b.iter(|| {
                let svg = renderer
                    .render(black_box(scene), PageId::default(), None)
                    .unwrap();
                black_box(svg.len());
            });
        });
    }

    group.finish();
}

criterion_group!(benches, bench_culling);
criterion_main!(benches);
