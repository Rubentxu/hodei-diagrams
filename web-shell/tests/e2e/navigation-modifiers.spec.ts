/**
 * navigation-modifiers.spec.ts — IP-A: Pan/Zoom/Nav modifier matrix
 *
 * Tests draw.io-parity navigation interactions:
 * - NAV-002: Plain wheel → vertical pan (not zoom)
 * - NAV-003: Shift+wheel → horizontal pan
 * - NAV-004: Right-click drag → pan
 * - NAV-005: Space+drag → pan
 * - NAV-007: Home key → reset view
 * - NAV-009: Ctrl+wheel → zoom (explicit modifier)
 *
 * Reference: docs/drawio-user-interaction-workflows.md
 * ADR-0079 (interaction parity strategy)
 */
import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';

test.describe('Suite IP-A: Navigation Modifiers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('NAV-002: plain wheel pans vertically (not zoom)', async ({ page }) => {
    // Read initial transform
    const container = page.locator('.canvas-container');
    const before = await container.evaluate((el) => el.style.transform);

    // Wheel down (deltaY > 0) should pan, not zoom
    await container.hover();
    await page.mouse.wheel(0, 200);

    await page.waitForTimeout(200);

    const after = await container.evaluate((el) => el.style.transform);

    // Transform should have changed
    expect(after).not.toBe(before);

    // Zoom value should NOT have changed (still 1 = scale(1))
    // If wheel zoomed, scale would be different from 1
    expect(after).toContain('scale(1)');
  });

  test('NAV-009: Ctrl+wheel zooms (explicit modifier)', async ({ page }) => {
    const zoomDisplay = page.locator('[data-testid="zoom-display"]');
    await expect(zoomDisplay).toContainText('100%');

    // Ctrl+wheel should zoom
    const container = page.locator('.canvas-container');
    await container.hover();

    // Dispatch a ctrl+wheel event — Playwright mouse.wheel doesn't support modifiers
    // directly, so we use evaluate to dispatch a WheelEvent with ctrlKey
    await container.evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    await page.waitForTimeout(200);

    // Zoom should have changed from 100%
    const zoomText = await zoomDisplay.textContent();
    expect(zoomText).not.toContain('100%');
  });

  test('NAV-003: Shift+wheel pans horizontally', async ({ page }) => {
    const container = page.locator('.canvas-container');
    const before = await container.evaluate((el) => el.style.transform);

    await container.hover();

    // Shift+wheel should pan horizontally
    await container.evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 200,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    await page.waitForTimeout(200);

    const after = await container.evaluate((el) => el.style.transform);
    expect(after).not.toBe(before);
    // Zoom should not change
    expect(after).toContain('scale(1)');
  });

  test('NAV-007: Home key resets view to 100%', async ({ page }) => {
    // First, change zoom via Ctrl+wheel
    const container = page.locator('.canvas-container');
    await container.evaluate((el) => {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    await page.waitForTimeout(200);

    // Verify zoom changed
    const zoomDisplay = page.locator('[data-testid="zoom-display"]');
    const zoomBefore = await zoomDisplay.textContent();
    expect(zoomBefore).not.toContain('100%');

    // Press Home to reset
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);

    // Zoom should be back to 100%
    await expect(zoomDisplay).toContainText('100%');
  });

  test('NAV-005: Space+drag pans the canvas', async ({ page }) => {
    const container = page.locator('.canvas-container');
    const before = await container.evaluate((el) => el.style.transform);

    // Press and hold Space
    await page.keyboard.down('Space');

    // Verify cursor changed to grab
    const cursor = await container.evaluate((el) => el.style.cursor);
    expect(cursor).toBe('grab');

    // Drag from center
    const box = await container.boundingBox();
    if (!box) throw new Error('No bounding box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy + 50);
    await page.waitForTimeout(100);
    await page.mouse.up();

    // Release Space
    await page.keyboard.up('Space');

    const after = await container.evaluate((el) => el.style.transform);
    expect(after).not.toBe(before);
  });

  test('NAV-004a: right-click drag pans the canvas', async ({ page }) => {
    const container = page.locator('.canvas-container');

    // Establish a known transform via wheel pan
    await container.hover();
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    const before = await container.evaluate((el) => el.style.transform);
    expect(before).not.toBe('');

    // Right-button drag via direct event dispatch
    await container.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      el.dispatchEvent(new MouseEvent('mousedown', {
        button: 2, clientX: cx, clientY: cy, bubbles: true,
      }));
      el.dispatchEvent(new MouseEvent('mousemove', {
        buttons: 2, clientX: cx + 40, clientY: cy + 40, bubbles: true,
      }));
      el.dispatchEvent(new MouseEvent('mouseup', {
        button: 2, clientX: cx + 40, clientY: cy + 40, bubbles: true,
      }));
    });
    await page.waitForTimeout(100);

    const after = await container.evaluate((el) => el.style.transform);
    expect(after).not.toBe(before);
  });

  test('NAV-004b: right-click without drag still opens context menu', async ({ page }) => {
    // Right-click on empty canvas area should show context menu
    const canvas = page.locator('.viewer');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('No bounding box');

    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8, { button: 'right' });

    const ctxMenu = page.locator('.context-menu');
    await expect(ctxMenu).toBeVisible({ timeout: 3000 });
  });
});
