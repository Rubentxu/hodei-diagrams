//! Phase 2 / P2-2 — Render-pipeline benchmarks for hodei-diagrams.
//!
//! Run with: `cargo run --release -p diagram-bench`
//! Output: per-stage timings (mean / median / min / max / p95 in ms) printed
//! to stdout.
//!
//! Native bench of the same code paths the WASM bridge executes (just
//! without the wasm-bindgen call overhead). Mirrors P2-1's perf-baseline
//! spec but adds N=20 iterations + statistical summary.

use std::path::Path;
use std::time::{Duration, Instant};

use diagram_commands::Editor;
use diagram_core::DiagramModel;
use diagram_core::StableIdExt;
use diagram_format_drawio::DrawioMapping;
use diagram_render_svg::SvgRenderer;
use diagram_scene::SceneBuilder;
use serde_json::json;

fn fixtures_dir() -> std::path::PathBuf {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    // CARGO_MANIFEST_DIR = <workspace>/crates/diagram-bench
    // Two .parent() hops reach <workspace>.
    manifest
        .parent()
        .and_then(|p| p.parent())
        .expect("workspace root")
        .join("web-shell/public/fixtures")
}

fn load_fixture(name: &str) -> String {
    let path = fixtures_dir().join(name);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read fixture {}: {e}", path.display()))
}

fn import_fixture(xml: &str) -> Editor {
    let raw = diagram_format_drawio::parse_drawio(xml).expect("parse_drawio");
    let (model, id_map) = DrawioMapping::new()
        .to_domain(&raw)
        .expect("DrawioMapping::to_domain");
    // Build a fresh empty editor then replace its model — this mirrors the
    // production path in `import_drawio` (which calls
    // `Editor::replace_model`).
    let mut editor = Editor::new(DiagramModel::default());
    editor.replace_model(model, Some(id_map));
    editor
}

fn build_scene(editor: &Editor) -> diagram_scene::Scene {
    SceneBuilder::new()
        .build(editor.model())
        .expect("scene build")
}

fn render_all_pages(scene: &diagram_scene::Scene) -> Vec<String> {
    let renderer = SvgRenderer::new();
    scene
        .pages
        .iter()
        .map(|p| renderer.render(scene, p.page_id).expect("render"))
        .collect()
}

fn percentile(sorted: &[Duration], pct: f64) -> Duration {
    if sorted.is_empty() {
        return Duration::ZERO;
    }
    let idx = ((sorted.len() as f64 - 1.0) * pct).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn summarize(label: &str, samples: &mut [Duration]) {
    if samples.is_empty() {
        println!("  {label}: (no samples)");
        return;
    }
    samples.sort();
    let n = samples.len();
    let sum: Duration = samples.iter().sum();
    let mean = sum / n as u32;
    let min = *samples.first().unwrap();
    let max = *samples.last().unwrap();
    let median = percentile(samples, 0.50);
    let p95 = percentile(samples, 0.95);
    let p99 = percentile(samples, 0.99);

    let fmt = |d: Duration| format!("{:>9.3}ms", d.as_secs_f64() * 1000.0);
    println!(
        "  {label:<46}  n={n:>3}  min={}  p50={}  mean={}  p95={}  p99={}  max={}",
        fmt(min),
        fmt(median),
        fmt(mean),
        fmt(p95),
        fmt(p99),
        fmt(max),
    );
}

fn run_bench<F: FnMut()>(name: &str, iters: u32, warmup: u32, mut f: F) -> Vec<Duration> {
    for _ in 0..warmup {
        f();
    }
    let mut samples = Vec::with_capacity(iters as usize);
    for _ in 0..iters {
        let t = Instant::now();
        f();
        samples.push(t.elapsed());
    }
    summarize(name, &mut samples);
    samples
}

fn bench_parse_drawio(name: &str, xml: &str, iters: u32, warmup: u32) {
    println!("[{name}] parse_drawio (XML → raw doc)");
    run_bench("  parse_drawio", iters, warmup, || {
        let _ = diagram_format_drawio::parse_drawio(xml).expect("parse");
    });
}

fn bench_mapping(name: &str, xml: &str, iters: u32, warmup: u32) {
    println!("[{name}] DrawioMapping::to_domain (raw doc → DiagramModel)");
    let raw = diagram_format_drawio::parse_drawio(xml).expect("parse");
    run_bench("  to_domain", iters, warmup, || {
        let _ = DrawioMapping::new().to_domain(&raw).expect("to_domain");
    });
}

fn bench_import_full(name: &str, xml: &str, iters: u32, warmup: u32) {
    println!("[{name}] full import (parse + map + replace_model)");
    run_bench("  import_full", iters, warmup, || {
        let raw = diagram_format_drawio::parse_drawio(xml).expect("parse");
        let (model, id_map) = DrawioMapping::new().to_domain(&raw).expect("to_domain");
        let mut editor = Editor::new(DiagramModel::default());
        editor.replace_model(model, Some(id_map));
    });
}

fn bench_get_scene(name: &str, editor: &Editor, iters: u32, warmup: u32) {
    println!("[{name}] scene build + serialize (model → JSON)");
    run_bench("  get_scene_json", iters, warmup, || {
        let scene = build_scene(editor);
        let json = serde_json::to_string(&scene).expect("serialize");
        std::hint::black_box(json.len());
    });
}

fn bench_get_scene_postcard(name: &str, editor: &Editor, iters: u32, warmup: u32) {
    println!("[{name}] scene build + serialize (model → postcard bytes)");
    run_bench("  get_scene_postcard", iters, warmup, || {
        let scene = build_scene(editor);
        let bytes = postcard::to_allocvec(&scene).expect("postcard serialize");
        std::hint::black_box(bytes.len());
    });
}

fn bench_render_svg(name: &str, editor: &Editor, iters: u32, warmup: u32) {
    println!("[{name}] SvgRenderer::render (scene → SVG string, all pages)");
    let scene = build_scene(editor);
    run_bench("  render_svg_string", iters, warmup, || {
        let svgs = render_all_pages(&scene);
        let total: usize = svgs.iter().map(|s| s.len()).sum();
        std::hint::black_box(total);
    });
}

fn bench_render_svg_buffer(name: &str, editor: &Editor, iters: u32, warmup: u32) {
    println!("[{name}] SvgRenderer::render (scene → buffer write, all pages)");
    // Simulates the zero-copy SVG buffer path: render each page then
    // "write" the bytes to a pre-allocated slab (Vec::clear + extend_from_slice).
    let scene = build_scene(editor);
    let mut svg_buf: Vec<u8> = Vec::with_capacity(2 * 1024 * 1024);
    run_bench("  render_svg_buffer", iters, warmup, || {
        svg_buf.clear();
        for page in &scene.pages {
            // use the synchronous render path (the actual WASM render_svg_to_buffer
            // does this exact same work: builds scene, finds page, renders to String)
            let svg = SvgRenderer::new()
                .render(&scene, page.page_id)
                .expect("render");
            svg_buf.extend_from_slice(svg.as_bytes());
        }
        std::hint::black_box(svg_buf.len());
    });
}

fn bench_full_pipeline(name: &str, xml: &str, iters: u32, warmup: u32) {
    println!("[{name}] FULL pipeline (parse + map + scene + render)");
    run_bench("  pipeline", iters, warmup, || {
        let raw = diagram_format_drawio::parse_drawio(xml).expect("parse");
        let (model, _id_map) = DrawioMapping::new().to_domain(&raw).expect("to_domain");
        let editor = Editor::new(model);
        let scene = build_scene(&editor);
        let svgs = render_all_pages(&scene);
        let total: usize = svgs.iter().map(|s| s.len()).sum();
        std::hint::black_box(total);
    });
}

fn bench_flush_commands_postcard(name: &str, xml: &str, iters: u32, warmup: u32) {
    println!("[{name}] command dispatch — postcard Vec<Command>");
    // Find a real vertex id from the imported model so the bench command
    // can be applied without VertexNotFound errors. We're measuring
    // deserialization + apply speed, not validation.
    let raw = diagram_format_drawio::parse_drawio(xml).expect("parse");
    let (model, _id_map) = DrawioMapping::new().to_domain(&raw).expect("to_domain");
    let real_vid = {
        let vids: Vec<_> = model.store.vertices_with_ids().map(|(id, _)| id).collect();
        vids.first()
            .copied()
            .unwrap_or(diagram_core::VertexId::default())
    };
    // Pre-encode a single ChangeStyle command against the real vertex.
    let payload = postcard::to_allocvec(&vec![diagram_commands::Command::ChangeStyle(
        diagram_commands::ChangeStylePayload::new(real_vid, {
            let mut s = diagram_core::StyleMap::new();
            s.insert("fillColor", diagram_core::StyleValue::from("#ff0000"));
            s
        }),
    )])
    .expect("postcard encode");

    run_bench("  flush_commands_postcard", iters, warmup, || {
        let (model2, _) = DrawioMapping::new()
            .to_domain(&diagram_format_drawio::parse_drawio(xml).expect("parse"))
            .expect("to_domain");
        let mut editor = Editor::new(model2);
        let cmds: Vec<diagram_commands::Command> =
            postcard::from_bytes(&payload).expect("postcard decode");
        let _ = editor.execute_batch(cmds);
    });
}

fn bench_flush_commands_json(name: &str, xml: &str, iters: u32, warmup: u32) {
    println!("[{name}] command dispatch — JSON array");
    // Find a real vertex id (same lookup as postcard bench).
    let raw = diagram_format_drawio::parse_drawio(xml).expect("parse");
    let (model, _id_map) = DrawioMapping::new().to_domain(&raw).expect("to_domain");
    let real_vid = {
        let vids: Vec<_> = model.store.vertices_with_ids().map(|(id, _)| id).collect();
        vids.first()
            .copied()
            .unwrap_or(diagram_core::VertexId::default())
    };
    let payload = {
        let (idx, version) = real_vid.stable_id_parts();
        json!([{
            "ChangeStyle": {
                "id": { "idx": idx, "version": version },
                "style": { "fillColor": "#ff0000" }
            }
        }])
        .to_string()
    };

    run_bench("  flush_commands_json", iters, warmup, || {
        let (model2, _) = DrawioMapping::new()
            .to_domain(&diagram_format_drawio::parse_drawio(xml).expect("parse"))
            .expect("to_domain");
        let mut editor = Editor::new(model2);
        let cmds: Vec<diagram_commands::Command> =
            serde_json::from_str(&payload).expect("json decode");
        let _ = editor.execute_batch(cmds);
    });
}

struct Args {
    iters: u32,
    warmup: u32,
    run_small: bool,
    run_large: bool,
}

fn parse_args() -> Args {
    let mut iters = 20u32;
    let mut warmup = 3u32;
    let mut run_small = false;
    let mut run_large = false;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--iters" => iters = args.next().unwrap().parse().unwrap(),
            "--warmup" => warmup = args.next().unwrap().parse().unwrap(),
            "--small" => run_small = true,
            "--large" => run_large = true,
            "--all" => {
                run_small = true;
                run_large = true;
            }
            "--help" | "-h" => {
                println!("Usage: phase2-bench [--all|--small|--large] [--iters N] [--warmup N]");
                std::process::exit(0);
            }
            other => panic!("unknown arg: {other}"),
        }
    }
    if !run_small && !run_large {
        run_small = true;
        run_large = true;
    }
    Args {
        iters,
        warmup,
        run_small,
        run_large,
    }
}

fn run_fixture_suite(label: &str, fixture: &str, args: &Args) {
    println!("\n=== {label} ===");
    let xml = load_fixture(fixture);
    let editor = import_fixture(&xml);
    bench_parse_drawio(label, &xml, args.iters, args.warmup);
    bench_mapping(label, &xml, args.iters, args.warmup);
    bench_import_full(label, &xml, args.iters, args.warmup);
    bench_get_scene(label, &editor, args.iters, args.warmup);
    bench_get_scene_postcard(label, &editor, args.iters, args.warmup);
    bench_render_svg(label, &editor, args.iters, args.warmup);
    bench_render_svg_buffer(label, &editor, args.iters, args.warmup);
    bench_full_pipeline(label, &xml, args.iters, args.warmup);
    bench_flush_commands_postcard(label, &xml, args.iters, args.warmup);
    bench_flush_commands_json(label, &xml, args.iters, args.warmup);
}

fn main() {
    let args = parse_args();
    println!(
        "Phase 2 / P2-2 — pipeline bench (iters={}, warmup={})",
        args.iters, args.warmup
    );
    if args.run_small {
        run_fixture_suite("simple-rect.drawio (224B)", "simple-rect.drawio", &args);
    }
    if args.run_large {
        run_fixture_suite(
            "aws-admision.drawio (3.9MB, 238 cells)",
            "aws-admision.drawio",
            &args,
        );
    }
    println!("\nDone.");
}
