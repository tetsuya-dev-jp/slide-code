export function createPanePreferences() {
  return {
    code: null,
    shell: null,
    markdown: null,
  };
}

export function getSlidePaneDefaults(slide, resolved) {
  const hasCode = Boolean(resolved?.code && resolved.code.trim());
  const hasMarkdown = Boolean(typeof slide?.markdown === 'string' && slide.markdown.trim());

  return {
    code: hasCode,
    shell: hasCode || !hasMarkdown,
    markdown: hasMarkdown,
  };
}

export function resolvePaneVisibility(preferences, defaults) {
  return {
    code: preferences.code ?? defaults.code,
    shell: preferences.shell ?? defaults.shell,
    markdown: preferences.markdown ?? defaults.markdown,
  };
}

export function applyPaneToggle({ pane, preferences, visibility, defaults }) {
  const visibleCount = Object.values(visibility).filter(Boolean).length;
  if (visibleCount <= 1 && visibility[pane]) {
    return {
      allowed: false,
      preferences,
      visibility,
    };
  }

  const nextVisible = !visibility[pane];
  const nextPreferences = {
    ...preferences,
    [pane]: nextVisible === defaults[pane] ? null : nextVisible,
  };

  return {
    allowed: true,
    preferences: nextPreferences,
    visibility: resolvePaneVisibility(nextPreferences, defaults),
  };
}
