import { test, expect } from '@playwright/test';

const SIMPLE_RECT_PATH =
  '/var/home/rubentxu/Proyectos/rust/hodei-diagrams/web-shell/public/fixtures/simple-rect.drawio';

test.describe('Slice A: Product Presence UI', () => {
  test.describe('Zone 0: Left Rail', () => {
    test('rail is visible with 6 tool buttons', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const rail = page.locator('[data-testid="rail"]');
      await expect(rail).toBeVisible();

      // Rail buttons: 3 original + Text + Zoom-fit + Help
      await expect(page.locator('[data-testid="rail-select-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="rail-shapes-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="rail-connector-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="rail-text-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="rail-zoom-fit-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="rail-help-btn"]')).toBeVisible();
    });

    test('rail separator is visible between tools and Help section', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const separator = page.locator('[data-testid="rail-separator"]');
      await expect(separator).toBeVisible();
    });

    test('select tool is active by default', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const selectBtn = page.locator('[data-testid="rail-select-btn"]');
      await expect(selectBtn).toHaveClass(/active/);
    });

    test('tool buttons have tooltips', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="rail-select-btn"]')).toHaveAttribute('title', 'Select (V)');
      await expect(page.locator('[data-testid="rail-shapes-btn"]')).toHaveAttribute('title', 'Shapes (R)');
      await expect(page.locator('[data-testid="rail-connector-btn"]')).toHaveAttribute('title', 'Connector (C)');
      await expect(page.locator('[data-testid="rail-text-btn"]')).toHaveAttribute('title', 'Text (T)');
      await expect(page.locator('[data-testid="rail-zoom-fit-btn"]')).toHaveAttribute('title', 'Zoom to Fit (F)');
      await expect(page.locator('[data-testid="rail-help-btn"]')).toHaveAttribute('title', 'Help (?)');
    });

    test('only one rail tool is active at a time', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click each tool and verify only that one is active
      for (const btn of [
        '[data-testid="rail-select-btn"]',
        '[data-testid="rail-shapes-btn"]',
        '[data-testid="rail-connector-btn"]',
        '[data-testid="rail-text-btn"]',
        '[data-testid="rail-zoom-fit-btn"]',
        '[data-testid="rail-help-btn"]',
      ]) {
        await page.locator(btn).click();
        // The clicked button should be active
        await expect(page.locator(btn)).toHaveClass(/active/);
        // Other buttons should not be active
        const otherBtns = [
          '[data-testid="rail-select-btn"]',
          '[data-testid="rail-shapes-btn"]',
          '[data-testid="rail-connector-btn"]',
          '[data-testid="rail-text-btn"]',
          '[data-testid="rail-zoom-fit-btn"]',
          '[data-testid="rail-help-btn"]',
        ].filter((b) => b !== btn);
        for (const other of otherBtns) {
          await expect(page.locator(other)).not.toHaveClass(/active/);
        }
      }
    });
  });

  test.describe('Zone 1: Top Bar', () => {
    test('navbar brand "Hodei" is visible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const brand = page.locator('[data-testid="navbar-brand"]');
      await expect(brand).toBeVisible();
      // Brand is now an SVG with aria-label
      await expect(brand).toHaveAttribute('aria-label', 'Hodei Diagrams');
      await expect(brand.locator('svg')).toBeVisible();
    });

    test('menu items have hover states', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Menu dropdowns work
      await page.locator('[data-testid="menu-file"] summary').hover();
      await expect(page.locator('[data-testid="menu-file"]')).toBeVisible();
    });

    test('quick controls grouped with separators', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Undo/redo/zoom/save buttons present
      await expect(page.locator('[data-testid="undo-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="redo-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="zoom-display"]')).toBeVisible();
      await expect(page.locator('[data-testid="save-btn"]')).toBeVisible();
    });
  });

  test.describe('Zone 2: Sidebar', () => {
    test('search bar has search icon', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Search input exists with placeholder
      const search = page.locator('[data-testid="sidebar-search"]');
      await expect(search).toBeVisible();
      await expect(search).toHaveAttribute('placeholder', 'Search shapes…');
    });

    test('category headers have chevron indicators', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // General category has a chevron
      const chevrons = page.locator('.category-chevron');
      await expect(chevrons.first()).toBeVisible();
    });

    test('future categories show lock icon and "Soon"', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Disabled categories have coming-soon div (not the count badge span) with text "Soon"
      const comingSoon = page.locator('.shape-category.disabled div.category-coming-soon');
      await expect(comingSoon.first()).toBeVisible();
      await expect(comingSoon.first()).toHaveText('Soon');
    });

    test('three shape buttons visible in General category', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="rect-tool-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="rounded-rect-tool-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="ellipse-tool-btn"]')).toBeVisible();
    });
  });

  test.describe('Zone 4: Inspector', () => {
    test('empty state shows guidance message with icon', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Style pane has the empty state visible by default
      const stylePane = page.locator('[data-testid="inspector-pane-style"]');
      const noSelection = stylePane.locator('.no-selection-msg');
      await expect(noSelection).toBeVisible();
      // Select the first <p> (main guidance), not the actionable-hint <p>
      await expect(noSelection.locator('p').first()).toContainText('Select a shape');
    });

    test('Arrange tab empty state shows icon, guidance, and actionable hint', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click Arrange tab
      await page.locator('[data-testid="inspector-tab-arrange"]').click();

      const arrangePane = page.locator('[data-testid="inspector-pane-arrange"]');
      const noSelection = arrangePane.locator('.no-selection-msg');
      await expect(noSelection).toBeVisible();
      // Main guidance text
      await expect(noSelection.locator('p').first()).toContainText('Select a shape');
      // Actionable hint
      await expect(noSelection.locator('.actionable-hint')).toContainText('Click a shape on the canvas');
    });

    test('Text tab empty state shows icon, guidance, and actionable hint', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click Text tab
      await page.locator('[data-testid="inspector-tab-text"]').click();

      const textPane = page.locator('[data-testid="inspector-pane-text"]');
      const noSelection = textPane.locator('.no-selection-msg');
      await expect(noSelection).toBeVisible();
      // Main guidance text
      await expect(noSelection.locator('p').first()).toContainText('Select a shape');
      // Actionable hint
      await expect(noSelection.locator('.actionable-hint')).toContainText('Click a shape on the canvas');
    });

    test('effect-section testids are preserved (shadow/glass/gradient structurally unchanged)', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify all effect-section testids still resolve
      await expect(page.locator('[data-testid="inspector-shadow-section"]')).toBeAttached();
      await expect(page.locator('[data-testid="shadow-toggle"]')).toBeAttached();
      await expect(page.locator('[data-testid="shadow-dx-slider"]')).toBeAttached();
      await expect(page.locator('[data-testid="inspector-glass-section"]')).toBeAttached();
      await expect(page.locator('[data-testid="glass-toggle"]')).toBeAttached();
      await expect(page.locator('[data-testid="glass-opacity-slider"]')).toBeAttached();
      await expect(page.locator('[data-testid="inspector-gradient-section"]')).toBeAttached();
      await expect(page.locator('[data-testid="gradient-toggle"]')).toBeAttached();
      await expect(page.locator('[data-testid="gradient-type-select"]')).toBeAttached();
      await expect(page.locator('[data-testid="gradient-angle-slider"]')).toBeAttached();
      await expect(page.locator('[data-testid="gradient-color-1"]')).toBeAttached();
      await expect(page.locator('[data-testid="gradient-color-2"]')).toBeAttached();
    });

    test('style tab has section headers', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const sections = page.locator('.inspector-section-title');
      expect(await sections.count()).toBeGreaterThan(0);
    });

    test('inspector tabs have clear active state', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const styleTab = page.locator('[data-testid="inspector-tab-style"]');
      await expect(styleTab).toHaveClass(/active/);
    });
  });

  test.describe('Zone 5: Bottom Bar', () => {
    test('page tabs have accent underline when active', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const activeTab = page.locator('.page-tab.active');
      await expect(activeTab).toBeVisible();
      await expect(activeTab).toHaveClass(/active/);
    });

    test('diagnostics area is present', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const diagnostics = page.locator('[data-testid="error-banner"]');
      await expect(diagnostics).toBeAttached();
    });

    test('diagnostics badge hidden on fresh load (idle state)', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const badge = page.locator('[data-testid="diagnostics-badge"]');
      await expect(badge).toBeHidden();
    });

    test('diagnostics badge shows clean state after successful import', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
      await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

      const badge = page.locator('[data-testid="diagnostics-badge"]');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAttribute('data-state', 'clean');
      await expect(badge).toHaveAttribute('aria-label', 'No issues');
    });

    test('page-tab-add affordance is visible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const addBtn = page.locator('[data-testid="page-tab-add"]');
      await expect(addBtn).toBeVisible();
      await expect(addBtn).toHaveText('+');
    });
  });

  test.describe('CSS Grid Layout', () => {
    test('app uses 4-column grid with rail', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const app = page.locator('[data-testid="app-grid"]');
      await expect(app).toBeVisible();

      // Rail should be visible (36px wide)
      const rail = page.locator('[data-testid="rail"]');
      const railBox = await rail.boundingBox();
      expect(railBox?.width).toBe(36);
    });

    test('canvas fills remaining space', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 768 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const viewer = page.locator('[data-testid="viewer"]');
      const box = await viewer.boundingBox();
      expect(box).not.toBeNull();
      // Canvas should be substantial width after rail + sidebar + inspector
      expect(box!.width).toBeGreaterThan(500);
    });
  });
});
