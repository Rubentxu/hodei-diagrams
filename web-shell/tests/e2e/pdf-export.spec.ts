import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers/app-ready.js';
import { fixturePath } from './fixtures.js';

const SIMPLE_RECT_PATH =
  fixturePath('simple-rect.drawio');

test.describe('Slice D: PDF Export', () => {
  /**
   * Test 1: PDF menu item is visible in Export submenu
   */
  test('PDF menu item is visible in Export submenu', async ({ page }) => {
    await waitForAppReady(page);

    await page.locator('[data-testid="menu-file"] summary').click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="menu-export"]').hover();
    await page.waitForTimeout(200);

    const pdfItem = page.locator('[data-testid="menu-export-pdf"]');
    await expect(pdfItem).toBeVisible();
    await expect(pdfItem).toHaveText('PDF');
    await expect(pdfItem).toHaveAttribute('title', 'Export diagram as PDF via browser print');
  });

  /**
   * Test 2: Clicking PDF menu item triggers window.print()
   */
  test('Clicking PDF menu item triggers window.print()', async ({ page }) => {
    await waitForAppReady(page);

    // Intercept window.print using evaluate before clicking
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__printIntercept = false;
      const _originalPrint = window.print.bind(window);
      window.print = () => {
        (window as unknown as Record<string, unknown>).__printIntercept = true;
        // Don't call originalPrint() since we don't want to open print dialog in test
      };
    });

    await page.locator('[data-testid="menu-file"] summary').click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="menu-export"]').hover();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="menu-export-pdf"]').click();

    const printCalled = await page.evaluate(() => (window as unknown as Record<string, boolean>).__printIntercept ?? false);
    expect(printCalled).toBe(true);
  });

  /**
   * Test 3: @media print CSS hides UI elements
   */
  test('@media print CSS hides navbar, sidebar, rail, inspector, hud, bottom-bar', async ({ page }) => {
    await waitForAppReady(page);

    // Load a diagram to have content visible
    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    // Evaluate the computed display value for each UI element when printing
    // We test the CSS rules directly by checking the stylesheet contains @media print rules
    const printStyles = await page.evaluate(() => {
      const sheets = document.styleSheets;
      let foundPrintMedia = false;
      let hideRules = 0;

      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule && rule.conditionText === 'print') {
              foundPrintMedia = true;
              const cssText = rule.cssText;
              // Check for the key hide rules
              if (cssText.includes('.navbar') && cssText.includes('display: none')) hideRules++;
              if (cssText.includes('.sidebar') && cssText.includes('display: none')) hideRules++;
              if (cssText.includes('.rail') && cssText.includes('display: none')) hideRules++;
              if (cssText.includes('.inspector') && cssText.includes('display: none')) hideRules++;
              if (cssText.includes('.hud') && cssText.includes('display: none')) hideRules++;
              if (cssText.includes('.bottom-bar') && cssText.includes('display: none')) hideRules++;
              if (cssText.includes('transform: none') && cssText.includes('!important')) hideRules++;
            }
          }
        } catch {
          // Cross-origin stylesheets may throw
        }
      }
      return { foundPrintMedia, hideRules };
    });

    expect(printStyles.foundPrintMedia).toBe(true);
    // Expect at least 7 rules: navbar, sidebar, rail, inspector, hud, bottom-bar, transform
    expect(printStyles.hideRules).toBeGreaterThanOrEqual(7);
  });

  /**
   * Test 4: @media print CSS sets canvas to display:block and transform:none
   */
  test('@media print CSS expands canvas and removes transform', async ({ page }) => {
    await waitForAppReady(page);

    await page.setInputFiles('[data-testid="file-input"]', SIMPLE_RECT_PATH);
    await page.waitForSelector('[data-testid="viewer"] svg', { timeout: 5000 });

    const printRules = await page.evaluate(() => {
      const sheets = document.styleSheets;
      const printCssRules: string[] = [];

      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule && rule.conditionText === 'print') {
              printCssRules.push(rule.cssText);
            }
          }
        } catch {
          // Cross-origin stylesheets may throw
        }
      }
      return printCssRules;
    });

    expect(printRules.length).toBeGreaterThan(0);
    const combinedPrintCss = printRules.join(' ');

    // Canvas container should be position:static and overflow:visible in print
    expect(combinedPrintCss).toContain('canvas-container');
    expect(combinedPrintCss).toContain('position: static');
    expect(combinedPrintCss).toContain('overflow: visible');

    // #app should be display:block in print
    expect(combinedPrintCss).toContain('#app');
    expect(combinedPrintCss).toContain('display: block');

    // transform: none !important should be present
    expect(combinedPrintCss).toContain('transform: none !important');
  });

  /**
   * Test 5: @media print CSS sets white background
   */
  test('@media print CSS sets white background', async ({ page }) => {
    await waitForAppReady(page);

    const printRules = await page.evaluate(() => {
      const sheets = document.styleSheets;
      const printCssRules: string[] = [];

      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule && rule.conditionText === 'print') {
              printCssRules.push(rule.cssText);
            }
          }
        } catch {
          // Cross-origin stylesheets may throw
        }
      }
      return printCssRules;
    });

    const combinedPrintCss = printRules.join(' ');
    // Body should have white background in print
    expect(combinedPrintCss).toContain('background: white');
    // Canvas container should have white background in print
    expect(combinedPrintCss).toContain('canvas-container');
    expect(combinedPrintCss).toContain('background: white');
  });
});
