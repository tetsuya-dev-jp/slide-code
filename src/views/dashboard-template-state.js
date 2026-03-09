function extractTemplateDeckId(templateId) {
  if (typeof templateId !== 'string') return '';
  const trimmed = templateId.trim();
  const match = trimmed.match(/^(.+)-template(?:-\d+)?$/);
  return match?.[1] || '';
}

export function parseTemplateSelection(value) {
  if (typeof value !== 'string' || !value.includes(':')) return null;
  const [source, templateId] = value.split(':');
  if (!source || !templateId) return null;
  return { source, templateId };
}

export function collectSavedTemplateDeckIds(templates) {
  const deckIds = new Set();
  (Array.isArray(templates?.local) ? templates.local : []).forEach((template) => {
    const deckId = extractTemplateDeckId(template?.id);
    if (deckId) deckIds.add(deckId);
  });
  return deckIds;
}

export function applyTemplateButtonState(buttonEl, isSaved) {
  if (!buttonEl) return;
  const deckTitle = buttonEl.dataset.title || 'このデッキ';
  buttonEl.classList.toggle('is-saved', isSaved);
  buttonEl.title = isSaved ? 'テンプレート保存済み（クリックで削除）' : 'テンプレート保存';
  buttonEl.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
  buttonEl.setAttribute(
    'aria-label',
    isSaved
      ? `デッキ「${deckTitle}」のテンプレートを削除`
      : `デッキ「${deckTitle}」をテンプレートとして保存`,
  );
  const labelEl = buttonEl.querySelector('.deck-card-action-label');
  if (labelEl) {
    labelEl.textContent = isSaved ? '解除' : '保存';
  }
}
