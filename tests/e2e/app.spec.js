import { expect, test } from '@playwright/test';

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForEditorReady(page, title) {
  await expect(page.locator('#viewEditor')).toBeVisible();
  await expect(page.locator('#editorDeckName')).toContainText(title);
  await expect(page.locator('.editor-slide-item')).toHaveCount(1);
  await expect(page.locator('#editorSlideTitle')).toHaveValue('スライド 1');
  await expect(page.locator('#editorFileRef')).toHaveValue('main.py');
}

async function createDeck(page, titlePrefix = 'Smoke') {
  const title = `${titlePrefix} Deck`;
  const folder = uniqueId('smoke');

  await page.goto('/');
  await expect(page.locator('#viewDashboard')).toBeVisible();
  await page.locator('#newDeckBtn').click();
  await page.locator('#deckModalName').fill(title);
  await page.locator('#deckModalFolder').fill(folder);
  await page.locator('#deckModalSubmit').click();
  await expect(page).toHaveURL(new RegExp(`#\\/deck\\/${folder}\\/edit$`));
  await waitForEditorReady(page, title);

  return { title, folder };
}

test('dashboard から新規 deck を作成できる', async ({ page }) => {
  const { folder } = await createDeck(page, 'Dashboard');

  await expect(page.locator('#viewEditor')).toBeVisible();
  await expect(page.locator('#editorDeckName')).toContainText('Dashboard Deck');
  await expect(page).toHaveURL(new RegExp(`#\\/deck\\/${folder}\\/edit$`));
});

test('editor で編集して保存状態を更新できる', async ({ page }) => {
  await createDeck(page, 'Editor');

  await page.locator('#editorSlideTitle').fill('イントロ');
  await page.locator('#editorMarkdown').fill('これは smoke test です。');
  await expect(page.locator('#addSlideBtn')).toBeEnabled();
  await page.locator('#addSlideBtn').click();
  await expect(page.locator('.editor-slide-item')).toHaveCount(2);
  await expect(page.locator('#editorSlideTitle')).toHaveValue('スライド 2');

  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');
});

test('presentation でスライド移動と pane toggle が動く', async ({ page }) => {
  const { folder } = await createDeck(page, 'Presentation');

  await page.locator('#addSlideBtn').click();
  await expect(page.locator('.editor-slide-item')).toHaveCount(2);
  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await page.locator('#editorPreviewBtn').click();
  await expect(page).toHaveURL(new RegExp(`#\\/deck\\/${folder}$`));
  await expect(page.locator('#viewPresentation')).toBeVisible();
  await expect(page.locator('#slideCounter')).toHaveText('1 / 2');

  await page.locator('#nextBtn').click();
  await expect(page.locator('#slideCounter')).toHaveText('2 / 2');
  await page.locator('#prevBtn').click();
  await expect(page.locator('#slideCounter')).toHaveText('1 / 2');

  await page.locator('.toggle-btn[data-pane="shell"]').click();
  await expect(page.locator('#paneShell')).toHaveClass(/hidden/);
});
