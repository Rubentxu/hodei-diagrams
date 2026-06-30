import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');
const ALL_SHAPES_PATH =
  fixturePath('all-shapes.drawio');
const DIAMOND_PATH =
  fixturePath('multi-shapes-diamond.drawio');

test.describe('Shape Catalog - Extended Shapes (ADR-0052, ADR-0053)', () => {
  /**
   * Test: Load fixture with all 11 shapes and verify they render
   */
  test('Import all-shapes.drawio fixture → all shapes render with data-vertex-id', async ({ page }) => {
    await waitForAppReady(page);

    // Load the all-shapes fixture
    await page.setInputFiles('[data-testid="file-input"]', ALL_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // We expect 11 shapes (Rect, RoundedRect, Ellipse, Diamond, Triangle, Hexagon, Cylinder, Cloud, Parallelogram, Trapezoid, Polygon)
    // Wait for shapes to render
    await page.waitForTimeout(500);

    const shapeCount = await page.locator('[data-vertex-id]').count();
    expect(shapeCount).toBe(11);
  });

  /**
   * Test: Create diamond from sidebar
   */
  test('Create diamond from sidebar → diamond appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Diamond tool
    await page.click('[data-testid="diamond-tool-btn"]');

    // Click on canvas to place diamond
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 300, y: 150 } });
    await page.waitForTimeout(300);

    // Verify a new shape was created
    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Create triangle from sidebar
   */
  test('Create triangle from sidebar → triangle appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Triangle tool
    await page.click('[data-testid="triangle-tool-btn"]');

    // Click on canvas
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 200, y: 200 } });
    await page.waitForTimeout(300);

    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Create hexagon from sidebar
   */
  test('Create hexagon from sidebar → hexagon appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Hexagon tool
    await page.click('[data-testid="hexagon-tool-btn"]');

    // Click on canvas
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 250, y: 200 } });
    await page.waitForTimeout(300);

    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Create cylinder from sidebar
   */
  test('Create cylinder from sidebar → cylinder appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Cylinder tool
    await page.click('[data-testid="cylinder-tool-btn"]');

    // Click on canvas
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(300);

    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Create cloud from sidebar
   */
  test('Create cloud from sidebar → cloud appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Cloud tool
    await page.click('[data-testid="cloud-tool-btn"]');

    // Click on canvas
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 350, y: 200 } });
    await page.waitForTimeout(300);

    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Create parallelogram from sidebar
   */
  test('Create parallelogram from sidebar → parallelogram appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Parallelogram tool
    await page.click('[data-testid="parallelogram-tool-btn"]');

    // Click on canvas
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 200, y: 300 } });
    await page.waitForTimeout(300);

    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Create trapezoid from sidebar
   */
  test('Create trapezoid from sidebar → trapezoid appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Trapezoid tool
    await page.click('[data-testid="trapezoid-tool-btn"]');

    // Click on canvas
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 300, y: 300 } });
    await page.waitForTimeout(300);

    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Create polygon from sidebar
   */
  test('Create polygon from sidebar → polygon appears', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const initialCount = await page.locator('[data-vertex-id]').count();

    // Click the Polygon tool
    await page.click('[data-testid="polygon-tool-btn"]');

    // Click on canvas
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(300);

    const newCount = await page.locator('[data-vertex-id]').count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  /**
   * Test: Import diamond fixture and verify multiple diamonds render
   */
  test('Import multi-shapes-diamond.drawio → multiple diamonds render', async ({ page }) => {
    await waitForAppReady(page);

    // Load the diamond fixture
    await page.setInputFiles('[data-testid="file-input"]', DIAMOND_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Wait for shapes to render
    await page.waitForTimeout(500);

    // We expect 4 diamond shapes
    const shapeCount = await page.locator('[data-vertex-id]').count();
    expect(shapeCount).toBe(4);
  });

  /**
   * Test: Verify all 11 shapes render as SVG elements (polygon/path elements)
   */
  test('All shapes render as valid SVG elements', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', ALL_SHAPES_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    // Count SVG elements that should be polygons or paths for the new shapes
    // The viewer should contain multiple polygon and path elements
    const viewer = page.locator('[data-testid="viewer"]');
    const svg = viewer.locator('svg');

    // Verify SVG is present
    await expect(svg).toBeVisible();

    // Verify we have polygon elements (diamond, triangle, hexagon, parallelogram, trapezoid, polygon)
    const polygonCount = await viewer.locator('polygon').count();
    expect(polygonCount).toBeGreaterThan(0);

    // Verify we have path elements (cylinder, cloud)
    const pathCount = await viewer.locator('path').count();
    expect(pathCount).toBeGreaterThan(0);
  });

  /**
   * Test: Create all 11 shapes sequentially
   */
  test('Create all 11 shapes sequentially → all appear', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const viewer = page.locator('[data-testid="viewer"]');
    const shapeTools = [
      'rect-tool-btn',
      'rounded-rect-tool-btn',
      'ellipse-tool-btn',
      'diamond-tool-btn',
      'triangle-tool-btn',
      'hexagon-tool-btn',
      'cylinder-tool-btn',
      'cloud-tool-btn',
      'parallelogram-tool-btn',
      'trapezoid-tool-btn',
      'polygon-tool-btn',
    ];

    const positions = [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 250, y: 50 },
      { x: 350, y: 50 },
      { x: 450, y: 50 },
      { x: 50, y: 150 },
      { x: 150, y: 150 },
      { x: 250, y: 150 },
      { x: 350, y: 150 },
      { x: 450, y: 150 },
      { x: 550, y: 150 },
    ];

    for (let i = 0; i < shapeTools.length; i++) {
      await page.click(`[data-testid="${shapeTools[i]}"]`);
      await viewer.click({ position: positions[i]! });
      await page.waitForTimeout(200);
    }

    // After creating all shapes, we should have original 1 + 11 new shapes = 12
    const finalCount = await page.locator('[data-vertex-id]').count();
    expect(finalCount).toBe(12);
  });
});
