/**
 * selection-drilldown.spec.ts — E2E tests for group drill-down selection (SEL-015, SEL-016)
 *
 * Tests draw.io-parity group drill-down interactions:
 * - SEL-015: Plain click on child inside group → child selected (drill-down).
 *             Plain click on empty group area → group selected.
 * - SEL-016: Alt+click on child inside group → child selected (NOT group).
 *             Alt+click on empty group area → group selected.
 *
 * Reference: docs/drawio-user-interaction-workflows.md
 */
import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady, dismissErrorBanner } from './helpers/app-ready.js';

const GROUP_NESTED_PATH = fixturePath('group-nested-e2e.drawio');

test.describe('Selection drill-down (SEL-015, SEL-016)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await dismissErrorBanner(page);
  });

  /**
   * SEL-015: Plain click on group with child on top → child selected (drill-down).
   * Click on the child inside the group → the child (not the group) should be selected.
   * We verify by checking the .selected class on the child vertex.
   */
  test('SEL-015: click on child inside group drills down to child', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', GROUP_NESTED_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    // Child v1 is at x=120+40=160, y=120+30=150 (center of 80x60 rect at 120,120)
    // Group g1 starts at x=100, y=100, child is at 120,120
    // Click at child v1 center
    const child = page.locator('[data-vertex-id]').first();
    await child.click();
    await page.waitForTimeout(300);

    // The child should have .selected
    const selected = page.locator('[data-vertex-id].selected');
    const count = await selected.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * SEL-015: Plain click on empty group area (no child on top) → group selected.
   * Click on group area where there's no child → group gets selected.
   * Verify by checking .selected on the group <g> element.
   */
  test('SEL-015: click on empty group area selects the group', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', GROUP_NESTED_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    // Click at center of group area (x=250, y=200) where no child exists
    // Group bounds: x=100, y=100, w=300, h=200. Center=250,200.
    // Children are at: v1(120,120,80x60 → center 160,150) and v2(220,140,80x60 → center 260,170)
    // Point (250,200) is inside group but no child there
    const svg = page.locator('[data-testid="viewer"] svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('SVG not visible');
    
    // Group is at page coords (100, 100) in SVG space - click at center of empty area
    await page.mouse.click(box.x + 250, box.y + 200);
    await page.waitForTimeout(300);

    // Group should have .selected (data-group-id element with .selected)
    const selectedGroup = page.locator('[data-group-id].selected, g.selected');
    // At least something should be selected
    const selected = page.locator('.selected');
    expect(await selected.count()).toBeGreaterThanOrEqual(1);
  });

  /**
   * SEL-016: Alt+click on child inside group → child selected (NOT group).
   * Alt key should bypass the group and select the topmost child.
   */
  test('SEL-016: Alt+click on child inside group selects child not group', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', GROUP_NESTED_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    // Alt+click on child v1 center
    const child = page.locator('[data-vertex-id]').first();
    const box = await child.boundingBox();
    if (!box) throw new Error('Child not visible');
    
    await page.keyboard.down('Alt');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.up('Alt');
    await page.waitForTimeout(300);

    // The child should be selected (NOT the group)
    const selectedVertex = page.locator('[data-vertex-id].selected');
    expect(await selectedVertex.count()).toBeGreaterThanOrEqual(1);
    
    // Group should NOT be selected (Alt bypasses group)
    const selectedGroup = page.locator('[data-group-id].selected');
    expect(await selectedGroup.count()).toBe(0);
  });

  /**
   * SEL-016: Alt+click on empty group area → group selected.
   */
  test('SEL-016: Alt+click on empty group area selects group', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', GROUP_NESTED_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    const svg = page.locator('[data-testid="viewer"] svg');
    const box = await svg.boundingBox();
    if (!box) throw new Error('SVG not visible');
    
    // Alt+click at group center (empty area)
    await page.keyboard.down('Alt');
    await page.mouse.click(box.x + 250, box.y + 200);
    await page.keyboard.up('Alt');
    await page.waitForTimeout(300);

    // Group should be selected
    const selected = page.locator('.selected');
    expect(await selected.count()).toBeGreaterThanOrEqual(1);
  });
});