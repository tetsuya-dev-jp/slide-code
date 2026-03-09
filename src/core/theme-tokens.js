const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

const UI_THEME_TOKENS = {
  dark: {
    bgPrimary: '#0b0b0b',
    bgSecondary: '#121212',
    bgTertiary: '#171717',
    bgElevated: '#1d1d1d',
    textPrimary: '#f2f2f2',
    textSecondary: '#d9d9d9',
    textTertiary: '#9e9e9e',
    textLink: '#d0ff6a',
    accentPrimary: '#b7ff1a',
    accentPrimaryHover: '#96d214',
    accentWarn: '#d6ff75',
    accentDanger: '#ef4444',
    borderDefault: '#2b2b2b',
    borderSubtle: '#202020',
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
    terminalAnsi: {
      black: '#0b0b0b',
      red: '#ef4444',
      green: '#b7ff1a',
      yellow: '#d6ff75',
      blue: '#8da2b1',
      magenta: '#b89ac7',
      cyan: '#78c5b2',
      white: '#f2f2f2',
      brightBlack: '#6f6f6f',
      brightRed: '#ff7d7d',
      brightGreen: '#d0ff6a',
      brightYellow: '#ecffad',
      brightBlue: '#b2c1cb',
      brightMagenta: '#d2bde8',
      brightCyan: '#9fd9cb',
      brightWhite: '#ffffff',
    },
  },
  light: {
    bgPrimary: '#f2f2f2',
    bgSecondary: '#e9e9e9',
    bgTertiary: '#dfdfdf',
    bgElevated: '#ffffff',
    textPrimary: '#0b0b0b',
    textSecondary: '#2e2e2e',
    textTertiary: '#666666',
    textLink: '#5f840f',
    accentPrimary: '#7aa91a',
    accentPrimaryHover: '#648c15',
    accentWarn: '#6b8f15',
    accentDanger: '#c45f67',
    borderDefault: '#c8c8c8',
    borderSubtle: '#dbdbdb',
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
    terminalAnsi: {
      black: '#0b0b0b',
      red: '#c45f67',
      green: '#7aa91a',
      yellow: '#8a7419',
      blue: '#5f7482',
      magenta: '#78628e',
      cyan: '#3f7a70',
      white: '#f2f2f2',
      brightBlack: '#666666',
      brightRed: '#d57b83',
      brightGreen: '#8fbe2f',
      brightYellow: '#ae9228',
      brightBlue: '#758996',
      brightMagenta: '#8f79a4',
      brightCyan: '#59998d',
      brightWhite: '#ffffff',
    },
  },
};

export function getThemeName(themeName) {
  return themeName === 'light' ? 'light' : 'dark';
}

export function getThemeTokens(themeName) {
  return UI_THEME_TOKENS[getThemeName(themeName)];
}

export function getTerminalTheme(themeName) {
  const normalizedThemeName = getThemeName(themeName);
  const tokens = getThemeTokens(normalizedThemeName);
  return {
    background: tokens.bgPrimary,
    foreground: tokens.textPrimary,
    cursor: tokens.textLink,
    cursorAccent: tokens.bgPrimary,
    selectionBackground: normalizedThemeName === 'light' ? 'rgba(122, 169, 26, 0.24)' : 'rgba(183, 255, 26, 0.28)',
    ...tokens.terminalAnsi,
  };
}

export function getMermaidTheme(themeName) {
  const tokens = getThemeTokens(themeName);
  return {
    primaryColor: tokens.bgElevated,
    primaryTextColor: tokens.textPrimary,
    primaryBorderColor: tokens.borderDefault,
    lineColor: tokens.textSecondary,
    secondaryColor: tokens.bgSecondary,
    tertiaryColor: tokens.bgTertiary,
    clusterBkg: tokens.bgSecondary,
    clusterBorder: tokens.borderDefault,
    edgeLabelBackground: tokens.bgElevated,
    noteBkgColor: tokens.bgElevated,
    noteBorderColor: tokens.borderDefault,
    noteTextColor: tokens.textPrimary,
    labelTextColor: tokens.textPrimary,
    fontFamily: tokens.fontSans,
  };
}

export function getMonacoThemeDefinition(themeName) {
  const normalizedThemeName = getThemeName(themeName);
  const tokens = getThemeTokens(normalizedThemeName);
  if (normalizedThemeName === 'light') {
    return {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': tokens.bgPrimary,
        'editor.foreground': tokens.textPrimary,
        'editorLineNumber.foreground': tokens.textTertiary,
        'editorLineNumber.activeForeground': tokens.textPrimary,
        'editorGutter.background': tokens.bgPrimary,
        'editor.lineHighlightBackground': tokens.bgSecondary,
        'editor.lineHighlightBorder': tokens.borderDefault,
        'editor.selectionBackground': '#7aa91a33',
        'editor.inactiveSelectionBackground': '#7aa91a1f',
        'editorCursor.foreground': tokens.textLink,
        'editorIndentGuide.background1': tokens.borderSubtle,
        'editorIndentGuide.activeBackground1': tokens.accentPrimary,
        'editorWhitespace.foreground': '#66666644',
        'scrollbarSlider.background': '#7aa91a30',
        'scrollbarSlider.hoverBackground': '#7aa91a45',
        'scrollbarSlider.activeBackground': '#7aa91a60',
      },
    };
  }

  return {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': tokens.bgPrimary,
      'editor.foreground': tokens.textPrimary,
      'editorLineNumber.foreground': '#8f8f8f',
      'editorLineNumber.activeForeground': tokens.textPrimary,
      'editorGutter.background': tokens.bgPrimary,
      'editor.lineHighlightBackground': tokens.bgTertiary,
      'editor.lineHighlightBorder': tokens.borderDefault,
      'editor.selectionBackground': '#b7ff1a40',
      'editor.inactiveSelectionBackground': '#b7ff1a28',
      'editorCursor.foreground': tokens.textLink,
      'editorIndentGuide.background1': '#242424',
      'editorIndentGuide.activeBackground1': tokens.accentPrimary,
      'editorWhitespace.foreground': '#8f8f8f44',
      'scrollbarSlider.background': '#b7ff1a38',
      'scrollbarSlider.hoverBackground': '#b7ff1a50',
      'scrollbarSlider.activeBackground': '#b7ff1a70',
    },
  };
}
