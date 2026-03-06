export function parseAssetReferences(markdownText) {
  if (typeof markdownText !== 'string' || !markdownText.trim()) return [];

  const refs = new Set();
  const pattern = /asset:\/\/([^\s)"'`<>]+)/g;
  let match = pattern.exec(markdownText);

  while (match) {
    refs.add(match[1]);
    match = pattern.exec(markdownText);
  }

  return Array.from(refs);
}
