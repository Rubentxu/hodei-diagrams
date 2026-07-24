import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const EMPTY_DIAGRAM = fixturePath('empty-diagram.drawio');

test.describe('Paste coalescing (REQ-COAL-001, COAL-003)', () => {
  test('50 rapid pastes complete without crash', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', EMPTY_DIAGRAM);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Add one rect and copy it to clipboard
    const added = await page.evaluate(() => {
      const debug = (window as unknown as { __hodeiDebug?: { addRectAt: (x: number, y: number, w: number, h: number) => boolean | null } }).__hodeiDebug;
      return debug?.addRectAt(100, 100, 80, 40) ?? null;
    });
    expect(added).toBe(true);
    await page.waitForTimeout(100);

    // Select the rect and copy to clipboard
    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 140, y: 120 } });
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(50);

    // Paste 50 times rapidly — each paste calls executeTransaction atomically.
    // The rAF coalescing ensures only 1 render for all 50.
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Control+v');
    }

    // Wait for rAF to fire and render to complete
    await page.waitForTimeout(200);

    // If we reach here without a crash, the test passes.
    // The coalescing behavior (1 render for 50 pastes) is verified by unit tests.
    // This E2E test verifies the paste workflow integrates correctly with WASM.
  });

  test('paste undo collapses pasted vertices in one operation', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', EMPTY_DIAGRAM);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Add one rect and copy it
    await page.evaluate(() => {
      const debug = (window as unknown as { __hodeiDebug?: { addRectAt: (x: number, y: number, w: number, h: number) => boolean | null } }).__hodeiDebug;
      debug?.addRectAt(100, 100, 80, 40);
    });
    await page.waitForTimeout(100);

    const viewer = page.locator('[data-testid="viewer"]');
    await viewer.click({ position: { x: 140, y: 120 } });
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(50);

    // Paste once
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(100);

    // Count vertices after paste
    const countAfterPaste = await page.evaluate(() => {
      const scene = (window as unknown as { __hodeiDebug?: { fetchSceneFresh: () => unknown } }).__hodeiDebug?.fetchSceneFresh() as { pages?: { display_list?: unknown[] }[] } | null;
      return scene?.pages?.[0]?.display_list?.length ?? 0;
    });
    expect(countAfterPaste).toBeGreaterThan(0);

    // Undo — should remove the pasted vertex in one operation
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    const countAfterUndo = await page.evaluate(() => {
      const scene = (window as unknown as { __hodeiDebug?: { fetchSceneFresh: () => unknown } }).__hodeiDebug?.fetchSceneFresh() as { pages?: { display_list?: unknown[] }[] } | null;
      return scene?.pages?.[0]?.display_list?.length ?? 0;
    });

    // Undo should remove the pasted vertex (one transaction = one undo entry)
    expect(countAfterUndo).toBeLessThan(countAfterPaste);
  });
});
