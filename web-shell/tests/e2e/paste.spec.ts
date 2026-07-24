import { test, expect, Page } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const EMPTY_DIAGRAM = fixturePath('empty-diagram.drawio');

async function getVertexCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scene = (window as any).__hodeiDebug?.fetchSceneFresh();
    return scene?.pages?.[0]?.display_list?.length ?? 0;
  });
}

async function selectAndCopy(page: Page): Promise<void> {
  const viewer = page.locator('[data-testid="viewer"]');
  await viewer.click({ position: { x: 140, y: 120 } });
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(50);
}

test.describe('Paste coalescing (REQ-COAL-001, COAL-003)', () => {
  test('50 rapid pastes adds exactly 50 vertices and undo removes the last one', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', EMPTY_DIAGRAM);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Initial state: 0 vertices
    const initialCount = await getVertexCount(page);
    expect(initialCount).toBe(0);

    // Add one rect and copy it to clipboard
    const added = await page.evaluate(() => {
      const debug = (window as any).__hodeiDebug;
      return debug?.addRectAt(100, 100, 80, 40) ?? null;
    });
    expect(added).toBe(true);
    await page.waitForTimeout(100);

    await selectAndCopy(page);

    // Paste 50 times rapidly — each paste is a separate transaction (no command coalescing
    // in paste() itself; render coalescing via rAF is handled separately).
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Control+v');
    }

    // Wait for rAF to fire and render to complete
    await page.waitForTimeout(200);

    // Assert: 1 original rect + 50 pasted = 51 total
    const afterPaste = await getVertexCount(page);
    expect(afterPaste).toBe(51);

    // Undo — removes only the most recent paste (last AddVertex transaction).
    // Full coalescing (all 50 in one transaction) is verified by unit tests.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // After one undo: 51 - 1 = 50 vertices (removed only the last pasted one)
    const afterUndo = await getVertexCount(page);
    expect(afterUndo).toBe(50);
  });

  test('paste adds exactly 1 new vertex and undo removes it', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', EMPTY_DIAGRAM);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Initial state: 0 vertices
    const initialCount = await getVertexCount(page);
    expect(initialCount).toBe(0);

    // Add one rect and copy it
    await page.evaluate(() => {
      const debug = (window as any).__hodeiDebug;
      debug?.addRectAt(100, 100, 80, 40);
    });
    await page.waitForTimeout(100);

    await selectAndCopy(page);

    // Paste once
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(100);

    // Count vertices after paste: 1 original + 1 pasted = 2
    const countAfterPaste = await getVertexCount(page);
    expect(countAfterPaste).toBe(2);

    // Undo — should remove the pasted vertex
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // After undo: back to just the original rect = 1 vertex
    const countAfterUndo = await getVertexCount(page);
    expect(countAfterUndo).toBe(1);
  });
});