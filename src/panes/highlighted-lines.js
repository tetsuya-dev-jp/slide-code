function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeAttributes(element) {
  return Array.from(element.attributes)
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join('');
}

function serializeOpenTag(element) {
  return `<${element.tagName.toLowerCase()}${serializeAttributes(element)}>`;
}

function serializeCloseTag(element) {
  return `</${element.tagName.toLowerCase()}>`;
}

export function splitHighlightedHtmlLines(highlightedHtml) {
  const template = document.createElement('template');
  template.innerHTML = highlightedHtml;

  const lines = [];
  const openElements = [];
  let currentLine = '';

  const pushLine = () => {
    currentLine += openElements.slice().reverse().map(serializeCloseTag).join('');
    lines.push(currentLine);
    currentLine = openElements.map(serializeOpenTag).join('');
  };

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent || '').split('\n');
      parts.forEach((part, index) => {
        currentLine += escapeHtml(part);
        if (index < parts.length - 1) {
          pushLine();
        }
      });
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    currentLine += serializeOpenTag(node);
    openElements.push(node);
    Array.from(node.childNodes).forEach(walk);
    openElements.pop();
    currentLine += serializeCloseTag(node);
  };

  Array.from(template.content.childNodes).forEach(walk);
  lines.push(currentLine);

  return lines;
}
