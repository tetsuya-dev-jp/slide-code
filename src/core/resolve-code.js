/**
 * Resolve a slide's code from the deck's files array
 * @param {Object} slide - Slide with fileRef + lineRange
 * @param {Object} deck - Deck with files array
 * @returns {{ code: string, language: string, highlightLines: number[] }}
 */
export function resolveSlideCode(slide, deck) {
  const files = deck.files || [];
  const file = files.find(f => f.name === slide.fileRef);
  if (!file) return { code: '', language: 'python', highlightLines: [] };

  const lines = file.code.split('\n');
  const [start, end] = slide.lineRange || [1, lines.length];
  const slicedLines = lines.slice(start - 1, end);
  const code = slicedLines.join('\n');

  const highlightLines = (slide.highlightLines || [])
    .filter(l => l >= start && l <= end)
    .map(l => l - start + 1);

  return { code, language: file.language || 'python', highlightLines };
}
