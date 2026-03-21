import { expect, test } from '@playwright/test';

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function setMarkdown(page, value) {
  await page.locator('[data-markdown-mode="markdown"]').click();
  const content = page.locator('#editorMarkdown .cm-content');
  await expect(content).toBeVisible();
  await content.fill(value);
}

async function waitForEditorReady(page, title) {
  await expect(page.locator('#viewEditor')).toBeVisible();
  await expect(page.locator('#editorDeckName')).toContainText(title);
  await expect(page.locator('.editor-slide-item')).toHaveCount(1);
  await expect(page.locator('#editorSlideTitle')).toHaveValue('スライド 1');
  await expect(page.locator('#editorFileRef')).not.toHaveValue('');
  await expect(page.locator('#editorFileName')).not.toHaveValue('');
  await expect(page.locator('#editorFileLang')).not.toHaveValue('');
  await expect(page.locator('[data-markdown-mode="live"]')).toHaveClass(/active/);
  await expect(page.locator('#editorMarkdownLivePane')).toBeVisible();
}

async function createDeck(page, titlePrefix = 'Smoke') {
  const title = `${titlePrefix} Deck`;
  const folder = uniqueId('smoke');

  await page.goto('/#/');
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
  await setMarkdown(page, 'これは smoke test です。');
  await expect(page.locator('#addSlideBtn')).toBeEnabled();
  await page.locator('#addSlideBtn').click();
  await expect(page.locator('.editor-slide-item')).toHaveCount(2);
  await expect(page.locator('#editorSlideTitle')).toHaveValue('スライド 2');

  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');
});

test('editor の解説ペインは LIVE と Markdown を切り替えつつ block 保存できる', async ({ page }) => {
  await createDeck(page, 'Markdown Live');

  await setMarkdown(page, '# 見出し\n\n- 項目A\n- 項目B');
  await page.locator('[data-markdown-mode="live"]').click();
  await expect(page.locator('#editorMarkdownLivePane h1')).toHaveText('見出し');
  await expect(page.locator('#editorMarkdownLivePane li')).toHaveCount(2);
  await expect(page.locator('#editorMarkdownLivePane')).not.toContainText('クリックして編集');
  await expect(page.locator('#editorMarkdownLivePane')).not.toContainText('HEADING');
  await expect(page.locator('#editorMarkdownLivePane button')).toHaveCount(0);

  await page.locator('#editorMarkdownLivePane [data-markdown-block-index]').first().click();
  const textarea = page.locator('.editor-markdown-live-editor');
  await expect(textarea).toBeVisible();
  await textarea.fill('# 更新した見出し');
  await page.locator('#editorMarkdownLivePane [data-markdown-block-index]').nth(1).click();

  await expect(page.locator('#editorMarkdownLivePane h1')).toHaveText('更新した見出し');

  await page.locator('[data-markdown-mode="markdown"]').click();
  await expect(page.locator('#editorMarkdown .cm-content')).toContainText('更新した見出し');
});

test('presentation でスライド移動と pane toggle が動く', async ({ page }) => {
  const { folder } = await createDeck(page, 'Presentation');

  await setMarkdown(page, '1枚目の解説');
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

  await expect(page.locator('#paneShell')).toHaveClass(/hidden/);
  await page.locator('.toggle-btn[data-pane="shell"]').click();
  await expect(page.locator('#paneShell')).not.toHaveClass(/hidden/);
});

test('presentation は手動の pane toggle を slide 移動後も保持する', async ({ page }) => {
  const { folder } = await createDeck(page, 'Presentation Persist');

  await setMarkdown(page, '1枚目の解説');
  await page.locator('#addSlideBtn').click();
  await page.locator('#editorFileRef').selectOption('');
  await setMarkdown(page, '2枚目は markdown only');
  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await page.locator('#editorPreviewBtn').click();
  await expect(page).toHaveURL(new RegExp(`#\/deck\/${folder}$`));
  await expect(page.locator('#viewPresentation')).toBeVisible();

  const shellPane = page.locator('#paneShell');
  const shellWasHidden = await shellPane.evaluate((el) => el.classList.contains('hidden'));
  await page.locator('.toggle-btn[data-pane="shell"]').click();
  if (shellWasHidden) {
    await expect(shellPane).not.toHaveClass(/hidden/);
  } else {
    await expect(shellPane).toHaveClass(/hidden/);
  }

  await page.locator('#nextBtn').click();
  await expect(page.locator('#slideCounter')).toHaveText('2 / 2');
  if (shellWasHidden) {
    await expect(shellPane).not.toHaveClass(/hidden/);
  } else {
    await expect(shellPane).toHaveClass(/hidden/);
  }
  await expect(page.locator('#paneCode')).toHaveClass(/hidden/);
  await expect(page.locator('#paneMarkdown')).not.toHaveClass(/hidden/);

  await page.locator('#prevBtn').click();
  await expect(page.locator('#slideCounter')).toHaveText('1 / 2');
  if (shellWasHidden) {
    await expect(shellPane).not.toHaveClass(/hidden/);
  } else {
    await expect(shellPane).toHaveClass(/hidden/);
  }
});

test('presentation は参照なしスライドで空の code pane を初期非表示にできる', async ({ page }) => {
  const { folder } = await createDeck(page, 'Markdown Only');

  await page.locator('#editorFileRef').selectOption('');
  await expect(page.locator('#editorFileRef')).toHaveValue('');
  await setMarkdown(page, '解説だけのスライド');
  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await page.locator('#editorPreviewBtn').click();
  await expect(page).toHaveURL(new RegExp(`#\\/deck\\/${folder}$`));
  await expect(page.locator('#viewPresentation')).toBeVisible();
  await expect(page.locator('#paneCode')).toHaveClass(/hidden/);
  await expect(page.locator('#paneShell')).toHaveClass(/hidden/);
  await expect(page.locator('#paneMarkdown')).not.toHaveClass(/hidden/);

  await page.locator('.toggle-btn[data-pane="shell"]').click();
  await expect(page.locator('#paneShell')).not.toHaveClass(/hidden/);

  await page.locator('.toggle-btn[data-pane="code"]').click();
  await expect(page.locator('#paneCode')).not.toHaveClass(/hidden/);
});

test('editor は未保存変更の画面遷移を確認し、キャンセル時は留まる', async ({ page }) => {
  const { folder } = await createDeck(page, 'Dirty Guard');

  await page.locator('#editorSlideTitle').fill('未保存の変更');

  const dismissDialog = page.waitForEvent('dialog');
  await page.evaluate(() => {
    globalThis.location.hash = '#/';
  });
  const firstDialog = await dismissDialog;
  await firstDialog.dismiss();

  await expect(page).toHaveURL(new RegExp(`#\/deck\/${folder}\/edit$`));
  await expect(page.locator('#viewEditor')).toBeVisible();

  const acceptDialog = page.waitForEvent('dialog');
  await page.evaluate(() => {
    globalThis.location.hash = '#/';
  });
  const secondDialog = await acceptDialog;
  await secondDialog.accept();

  await expect(page.locator('#viewDashboard')).toBeVisible();
});

test('editor はファイル名変更後もスライド参照を維持できる', async ({ page }) => {
  const { folder } = await createDeck(page, 'Stable File');

  await page.locator('#addFileBtn').click();
  await expect(page.locator('.editor-file-tab')).toHaveCount(2);

  await page.locator('#editorFileName').fill('helpers.py');
  await page.locator('#editorSlideTitle').click();
  await page.locator('#editorFileRef').selectOption({ index: 2 });
  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`#\/deck\/${folder}\/edit$`));
  await waitForEditorReady(page, 'Stable File Deck');
  await expect(page.locator('.editor-slide-meta')).toContainText('helpers.py');
});

test('editor のスライド一覧は Enter キーで選択できる', async ({ page }) => {
  await createDeck(page, 'Slide Selection');

  await page.locator('#editorSlideTitle').fill('First');
  await page.locator('#addSlideBtn').click();
  await page.locator('#editorSlideTitle').fill('Second');
  await page.locator('#editorDeckName').click();

  await page.locator('.editor-slide-item').nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#editorSlideTitle')).toHaveValue('First');
});

test('dashboard は JSON なしで zip export をダウンロードできる', async ({ page }) => {
  const { title } = await createDeck(page, 'ZIP書き出し');

  await page.goto('/#/');
  await expect(page.locator('#viewDashboard')).toBeVisible();

  const deckCard = page.locator('.deck-card', { hasText: title }).first();
  await deckCard.locator('.deck-export').click();
  await expect(page.locator('#deckExportFormat option')).toHaveCount(3);
  await expect(page.locator('#deckExportFormat')).not.toContainText('JSON');
  await page.locator('#deckExportFormat').selectOption('zip');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#deckExportForm button[type="submit"]').click();
  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();

  await expect(suggestedFilename).toContain('.zip');
  await expect(suggestedFilename).toContain(title.replace(/\s+/g, '_'));
});

test('root から再表示すると最後の presentation route と slide を復元する', async ({ page }) => {
  const { folder } = await createDeck(page, 'Restore Route');

  await setMarkdown(page, '1枚目の解説');
  await page.locator('#addSlideBtn').click();
  await setMarkdown(page, '2枚目の解説');
  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await page.locator('#editorPreviewBtn').click();
  await expect(page).toHaveURL(new RegExp(`#\/deck\/${folder}$`));
  await expect(page.locator('#slideCounter')).toHaveText('1 / 2');
  await page.locator('#nextBtn').click();
  await expect(page.locator('#slideCounter')).toHaveText('2 / 2');

  await page.goto('/');

  await expect(page).toHaveURL(new RegExp(`#\/deck\/${folder}$`));
  await expect(page.locator('#viewPresentation')).toBeVisible();
  await expect(page.locator('#slideCounter')).toHaveText('2 / 2');
});

test('dashboard で recent filter と title sort を切り替えられる', async ({ page }) => {
  const first = await createDeck(page, 'Recent Alpha');
  await page.goto('/#/');
  await expect(page.locator('#viewDashboard')).toBeVisible();

  const second = await createDeck(page, 'Recent Beta');
  await page.goto('/#/');
  await expect(page.locator('#viewDashboard')).toBeVisible();

  await page.locator('#deckStatusFilter').selectOption('recent');
  await expect(page.locator('.deck-card')).toHaveCount(2);
  await expect(page.locator('.deck-card-title').first()).toHaveText(second.title);

  await page.locator('#deckSearchInput').fill('Alpha');
  await expect(page.locator('.deck-card')).toHaveCount(1);
  await expect(page.locator('.deck-card-title').first()).toHaveText(first.title);

  await page.locator('#deckSearchInput').fill('');
  await page.locator('#deckSortSelect').selectOption('title-asc');
  await expect(page.locator('.deck-card-title').first()).toHaveText(first.title);
});

test('presentation の layout picker はキーボード操作と非 DnD 並び替えに対応する', async ({
  page,
}) => {
  const { folder } = await createDeck(page, 'Accessible Layout');

  await page.locator('#editorPreviewBtn').click();
  await expect(page).toHaveURL(new RegExp(`#\/deck\/${folder}$`));
  await expect(page.locator('#viewPresentation')).toBeVisible();

  const layoutBtn = page.locator('#layoutPickerBtn');
  await layoutBtn.click();

  await expect(layoutBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#layoutDropdown')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(layoutBtn).toHaveAttribute('aria-expanded', 'false');

  await layoutBtn.click();
  await page.locator('.pane-move-prev[data-pane="shell"]').click();
  await expect(page.locator('.pane-order-item').nth(0)).toContainText('シェル');

  await page.keyboard.press('Escape');
  await expect(page.locator('#layoutDropdown')).toBeHidden();
});

test('editor 設定で monaco 表示と autosave を切り替えられる', async ({ page }) => {
  await createDeck(page, 'Editor Preferences');

  await page.locator('#editorPreferencesBtn').click();
  await expect(page.locator('#editorPreferencesModal')).toBeVisible();

  await page.locator('#editorPrefFontSize').selectOption('20');
  await page.locator('#editorPrefWordWrap').selectOption('off');
  await page.locator('#editorPrefLineNumbers').selectOption('off');
  await page.locator('#editorPrefMinimap').uncheck();
  await page.locator('#editorPrefAutosave').uncheck();
  await page.locator('#editorPreferencesSave').click();

  await expect(page.locator('#editorPreferencesModal')).toBeHidden();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await page.locator('#editorSlideTitle').fill('autosave off');
  await page.waitForTimeout(1800);
  await expect(page.locator('#editorSaveStatus')).toHaveText('未保存の変更');
});

test('presentation で slide jump と shell actions を使える', async ({ page }) => {
  const { folder } = await createDeck(page, 'Presentation Controls');

  await setMarkdown(page, '1枚目');
  await page.locator('#addSlideBtn').click();
  await setMarkdown(page, '2枚目');
  await page.locator('#addSlideBtn').click();
  await setMarkdown(page, '3枚目');
  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await page.locator('#editorPreviewBtn').click();
  await expect(page).toHaveURL(new RegExp(`#\/deck\/${folder}$`));
  await expect(page.locator('#slideCounter')).toHaveText('1 / 3');

  await page.locator('#nextBtn').click();
  await expect(page.locator('#slideCounter')).toHaveText('2 / 3');

  await page.locator('#slideJumpInput').fill('3');
  await page.locator('#slideJumpBtn').click();
  await expect(page.locator('#slideCounter')).toHaveText('3 / 3');

  await expect(page.locator('#shellStatus')).toContainText(/接続|切断|エラー/);
});

test('editor は duplicate filename を即時バリデーションする', async ({ page }) => {
  await createDeck(page, 'Duplicate File Validation');

  await page.locator('#addFileBtn').click();
  await expect(page.locator('.editor-file-tab')).toHaveCount(2);

  await page.locator('#editorFileName').fill('main.py');
  await expect(page.locator('#editorFileNameError')).toHaveText('同名のファイルが既に存在します');

  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存エラー');
  await expect(page.locator('#editorFileName')).toBeFocused();
});

test('editor は save 後に正規化された file name を再同期する', async ({ page }) => {
  await createDeck(page, 'Normalized File Name');

  await page.locator('#editorFileName').fill('src\\demo.py');
  await page.locator('#editorSlideTitle').click();
  await page.locator('#editorSaveBtn').click();
  await expect(page.locator('#editorSaveStatus')).toHaveText('保存済み');

  await expect(page.locator('#editorFileName')).toHaveValue('src/demo.py');
  await expect(page.locator('.editor-file-tab').first()).toContainText('src/demo.py');
  await expect(page.locator('#editorFileRef')).toHaveValue(/file-/);
});
