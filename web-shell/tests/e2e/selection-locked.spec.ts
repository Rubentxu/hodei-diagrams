/**
 * selection-locked.spec.ts — E2E tests for locked group selection behavior
 *
 * Tests that when clicking on a child inside a locked group:
 * - The unlocked child is selected (locked group is skipped)
 *
 * Reference: docs/drawio-user-interaction-workflows.md
 */
import { test, expect } from '@playwright/test';
import { fixturePath } from './fixtures.js';
import { waitForAppReady, dismissErrorBanner } from './helpers/app-ready.js';

const LOCKED_GROUP_PATH = fixturePath('group-locked-e2e.drawio');

test.describe('Locked group selection', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await dismissErrorBanner(page);
  });

  /**
   * Locked group: clicking on the child inside the locked group should
   * select the unlocked child, not the locked group.
   */
  test('clicking child inside locked group selects unlocked child', async ({ page }) => {
    await page.setInputFiles('[data-testid="file-input"]', LOCKED_GROUP_PATH);
    await expect(page.locator('[data-testid="viewer"] svg')).toBeVisible();

    // Click on child v1 (inside the locked group)
    const child = page.locator('[data-vertex-id]').first();
    const box = await child.boundingBox();
    if (!box) throw new Error('Child not visible');
    
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);

    // The child should be selected (locked group skipped)
    const selectedVertex = page.locator('[data-vertex-id].selected');
    expect(await selectedVertex.count()).toBeGreaterThanOrEqual(1);
  });
});