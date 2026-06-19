import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Slice B: Professional Density UI', () => {
  test.describe('HUD / Status Strip', () => {
    test('HUD is visible between canvas and bottom bar', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hud = page.locator('[data-testid="hud"]');
      await expect(hud).toBeVisible();
    });

    test('HUD shows initial state: no selection, page 1/1, zoom 100%, Edit mode', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hud = page.locator('[data-testid="hud"]');
      await expect(hud).toBeVisible();

      // Selection: Nothing selected
      const selValue = page.locator('[data-testid="hud-selection"]');
      await expect(selValue).toHaveText('Nothing selected');

      // Page: 1/1
      const pageValue = page.locator('[data-testid="hud-page"]');
      await expect(pageValue).toHaveText('1/1');

      // Zoom: 100%
      const zoomValue = page.locator('[data-testid="hud-zoom"]');
      await expect(zoomValue).toHaveText('100%');

      // Mode: Edit
      const modeValue = page.locator('[data-testid="hud-mode"]');
      await expect(modeValue).toHaveText('Edit');
    });

    test('HUD updates page count after import', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const pageValue = page.locator('[data-testid="hud-page"]');
      await expect(pageValue).toHaveText('1/1');
    });

    test('HUD zoom reset button resets zoom to 100%', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Import a diagram
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      // Zoom in with wheel
      const canvas = page.locator('[data-testid="canvas-container"]');
      await canvas.hover({ position: { x: 600, y: 200 } });
      await page.mouse.wheel(0, -10); // scroll up = zoom in
      await page.waitForTimeout(200);

      // Verify zoom changed
      const zoomBtn = page.locator('[data-testid="hud-zoom"]');
      let zoomText = await zoomBtn.textContent();
      expect(zoomText).not.toBe('100%');

      // Click HUD zoom reset button directly via JS
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="hud-zoom"]') as HTMLButtonElement;
        btn?.click();
      });
      await page.waitForTimeout(200);

      // Zoom should be back to 100%
      await expect(zoomBtn).toHaveText('100%');
    });

    test('HUD uses monospace font', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hud = page.locator('[data-testid="hud"]');
      const fontFamily = await hud.evaluate((el) =>
        window.getComputedStyle(el).fontFamily
      );
      expect(fontFamily).toContain('JetBrains Mono');
    });
  });

  test.describe('Grid Overlay', () => {
    test('grid is hidden by default', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const canvas = page.locator('[data-testid="canvas-container"]');
      await expect(canvas).not.toHaveClass(/show-grid/);
    });

    test('View > Grid menu item toggles grid visibility', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const canvas = page.locator('[data-testid="canvas-container"]');
      const gridMenu = page.locator('[data-testid="menu-view"]');

      // Open View menu
      await gridMenu.locator('summary').click();

      // Click Grid menu item
      const gridItem = page.locator('[data-testid="menu-grid"]');
      await gridItem.click();

      // Grid should be visible
      await expect(canvas).toHaveClass(/show-grid/);

      // Menu item should have checkmark
      await expect(gridItem).toHaveClass(/has-checkmark/);

      // Click again to hide
      await gridItem.click();
      await expect(canvas).not.toHaveClass(/show-grid/);
    });

    test('Ctrl+G keyboard shortcut toggles grid', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const canvas = page.locator('[data-testid="canvas-container"]');

      // Press Ctrl+G to show grid
      await page.keyboard.press('Control+g');
      await expect(canvas).toHaveClass(/show-grid/);

      // Press Ctrl+G again to hide
      await page.keyboard.press('Control+g');
      await expect(canvas).not.toHaveClass(/show-grid/);
    });

    test('grid visibility persists in localStorage', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const canvas = page.locator('[data-testid="canvas-container"]');
      const gridMenu = page.locator('[data-testid="menu-view"]');

      // Open View menu and toggle grid
      await gridMenu.locator('summary').click();
      await page.locator('[data-testid="menu-grid"]').click();
      await expect(canvas).toHaveClass(/show-grid/);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Grid should still be visible
      await expect(canvas).toHaveClass(/show-grid/);
    });
  });

  test.describe('Compact Inspector', () => {
    test('inspector has compact control spacing', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Import a shape to show inspector fields
      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const viewer = page.locator('[data-testid="viewer"]');
      const rect = viewer.locator('[data-vertex-id]').first();
      await rect.click();
      await page.waitForTimeout(200);

      // Check that color inputs are 24px circle swatches
      const colorInput = page.locator('[data-testid="inspector-fill"]');
      await expect(colorInput).toBeVisible();
      const width = await colorInput.evaluate((el) => (el as HTMLInputElement).offsetWidth);
      expect(width).toBe(24);

      // Check hex text inputs are present
      const hexInput = page.locator('[data-testid="inspector-fill-hex"]');
      await expect(hexInput).toBeVisible();
    });

    test('Bold/Italic are button toggles with active state', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      // Switch to Text tab
      await page.click('[data-testid="inspector-tab-text"]');
      await page.waitForTimeout(100);

      const viewer = page.locator('[data-testid="viewer"]');
      const rect = viewer.locator('[data-vertex-id]').first();
      await rect.click();
      await page.waitForTimeout(200);

      const boldBtn = page.locator('[data-testid="inspector-bold"]');
      const italicBtn = page.locator('[data-testid="inspector-italic"]');

      await expect(boldBtn).toBeVisible();
      await expect(italicBtn).toBeVisible();

      // Bold button should be 28px square
      const boldWidth = await boldBtn.evaluate((el) => el.offsetWidth);
      expect(boldWidth).toBe(28);

      // Click bold - should get active class
      await boldBtn.click();
      await expect(boldBtn).toHaveClass(/active/);
    });

    test('font family dropdown is compact width', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      await page.click('[data-testid="inspector-tab-text"]');
      await page.waitForTimeout(100);

      const viewer = page.locator('[data-testid="viewer"]');
      const rect = viewer.locator('[data-vertex-id]').first();
      await rect.click();
      await page.waitForTimeout(200);

      const fontSelect = page.locator('[data-testid="inspector-font-family"]');
      await expect(fontSelect).toBeVisible();
      const width = await fontSelect.evaluate((el) => el.offsetWidth);
      expect(width).toBeLessThanOrEqual(130);
    });
  });

  test.describe('Sidebar Density', () => {
    test('shape buttons are 40x40 with compact labels', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const rectBtn = page.locator('[data-testid="rect-tool-btn"]');
      await expect(rectBtn).toBeVisible();

      const width = await rectBtn.evaluate((el) => el.offsetWidth);
      const height = await rectBtn.evaluate((el) => el.offsetHeight);

      // Should be 40x40
      expect(width).toBeLessThanOrEqual(44);
      expect(height).toBeLessThanOrEqual(44);
    });

    test('search bar is 28px height', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const search = page.locator('[data-testid="sidebar-search"]');
      await expect(search).toBeVisible();
      const height = await search.evaluate((el) => el.offsetHeight);
      expect(height).toBe(28);
    });

    test('category headers use 10px uppercase font', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const catTitle = page.locator('.category-title').first();
      await expect(catTitle).toBeVisible();

      const fontSize = await catTitle.evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize)
      );
      expect(fontSize).toBeLessThanOrEqual(11);

      const textTransform = await catTitle.evaluate((el) =>
        window.getComputedStyle(el).textTransform
      );
      expect(textTransform).toBe('uppercase');
    });
  });

  test.describe('Design Token Normalization', () => {
    test('motion transitions use CSS custom properties', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Check that --motion-fast, --motion-normal are defined
      const hasMotionFast = await page.evaluate(() => {
        const value = getComputedStyle(document.documentElement)
          .getPropertyValue('--motion-fast').trim();
        return value.length > 0;
      });
      expect(hasMotionFast).toBe(true);

      const hasMotionNormal = await page.evaluate(() => {
        const value = getComputedStyle(document.documentElement)
          .getPropertyValue('--motion-normal').trim();
        return value.length > 0;
      });
      expect(hasMotionNormal).toBe(true);
    });

    test('hud-h token is defined and used', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const hasHudH = await page.evaluate(() => {
        const value = getComputedStyle(document.documentElement)
          .getPropertyValue('--hud-h').trim();
        return value.length > 0;
      });
      expect(hasHudH).toBe(true);
    });

    test('spacing tokens follow DESIGN.md scale', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Check xs=4, sm=8, md=12, lg=16
      const xs = await page.evaluate(() =>
        parseInt(getComputedStyle(document.documentElement).getPropertyValue('--xs').trim())
      );
      const sm = await page.evaluate(() =>
        parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sm').trim())
      );
      const md = await page.evaluate(() =>
        parseInt(getComputedStyle(document.documentElement).getPropertyValue('--md').trim())
      );
      const lg = await page.evaluate(() =>
        parseInt(getComputedStyle(document.documentElement).getPropertyValue('--lg').trim())
      );

      expect(xs).toBe(4);
      expect(sm).toBe(8);
      expect(md).toBe(12);
      expect(lg).toBe(16);
    });
  });
});
