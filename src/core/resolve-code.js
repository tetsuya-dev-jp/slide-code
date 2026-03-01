/**
 * Resolve a slide's code from the deck's files array
 * @param {Object} slide - Slide with fileRef + lineRange
 * @param {Object} deck - Deck with files array
 * @returns {{ code: string, language: string, highlightLines: number[] }}
 */
export function resolveSlideCode(slide, deck) {
  const files = deck?.files || [];
  const file = files.find(f => f.name === slide.fileRef);
  if (!file) return { code: '', language: 'python', highlightLines: [] };

  const lines = (file.code || '').split('\n');
  const totalLines = Math.max(lines.length, 1);
  const requestedStart = parseInt(Array.isArray(slide.lineRange) ? slide.lineRange[0] : 1, 10);
  const requestedEnd = parseInt(Array.isArray(slide.lineRange) ? slide.lineRange[1] : requestedStart, 10);

  const start = Math.min(Math.max(Number.isFinite(requestedStart) ? requestedStart : 1, 1), totalLines);
  const end = Math.min(
    Math.max(Number.isFinite(requestedEnd) ? requestedEnd : start, start),
    totalLines,
  );

  const slicedLines = lines.slice(start - 1, end);
  const code = slicedLines.join('\n');

  const highlightLines = (slide.highlightLines || [])
    .filter(l => l >= start && l <= end)
    .map(l => l - start + 1);

  return { code, language: file.language || 'python', highlightLines };
}
