// anchor.js - Robust DOM anchoring, range wrapping, and multi-strategy restoration

const WebHighlighterAnchor = (() => {
  function generateId() {
    return 'hl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  function getElementXPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    if (element.id && !element.id.startsWith('web-hl-')) {
      return `//*[@id="${element.id}"]`;
    }
    const paths = [];
    for (; element && element.nodeType === Node.ELEMENT_NODE; element = element.parentNode) {
      if (element.tagName.toLowerCase() === 'html') {
        paths.unshift('/html');
        break;
      }
      if (element.tagName.toLowerCase() === 'body') {
        paths.unshift('/html/body');
        break;
      }
      let index = 1;
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === element.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      const tagName = element.tagName.toLowerCase();
      paths.unshift(`${tagName}[${index}]`);
    }
    return '/' + paths.join('/');
  }

  function getElementByXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
  }

  function getTextNodeDescriptor(textNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
    let parent = textNode.parentNode;
    while (parent && parent.classList && parent.classList.contains('web-hl-mark')) {
      parent = parent.parentNode;
    }
    if (!parent) return null;

    let textIndex = 0;
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT, null);
    let current;
    while ((current = walker.nextNode())) {
      if (current === textNode) break;
      textIndex++;
    }

    return {
      parentXPath: getElementXPath(parent),
      textIndex: textIndex
    };
  }

  function getTextNodeFromDescriptor(desc) {
    if (!desc || !desc.parentXPath) return null;
    const parent = getElementByXPath(desc.parentXPath);
    if (!parent) return null;

    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT, null);
    let current;
    let index = 0;
    while ((current = walker.nextNode())) {
      if (index === desc.textIndex) return current;
      index++;
    }
    return null;
  }

  function getTextNodesInRange(range) {
    const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

    const textNodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('.web-hl-ui-root')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (range.intersectsNode(node)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let current;
    while ((current = walker.nextNode())) {
      textNodes.push(current);
    }
    return textNodes;
  }

  // Wrap target range in highlight marks with accurate node slicing
  function wrapRange(range, highlightId, color) {
    const textNodes = getTextNodesInRange(range);
    if (textNodes.length === 0) return [];

    const createdMarks = [];

    // Helper to create and insert mark
    function wrapTextNode(targetNode) {
      if (!targetNode || targetNode.nodeType !== Node.TEXT_NODE) return null;
      if (targetNode.textContent.length === 0) return null;

      // If already wrapped in one of our marks, update it
      const parent = targetNode.parentNode;
      if (parent && parent.classList && parent.classList.contains('web-hl-mark')) {
        parent.dataset.hlId = highlightId;
        parent.dataset.color = color;
        parent.className = `web-hl-mark web-hl-color-${color}`;
        return parent;
      }

      const mark = document.createElement('mark');
      mark.className = `web-hl-mark web-hl-color-${color}`;
      mark.dataset.hlId = highlightId;
      mark.dataset.color = color;

      parent.insertBefore(mark, targetNode);
      parent.removeChild(targetNode);
      mark.appendChild(targetNode);
      return mark;
    }

    // CASE 1: Single text node selection (most common)
    if (textNodes.length === 1) {
      const node = textNodes[0];
      let startOffset = (node === range.startContainer) ? range.startOffset : 0;
      let endOffset = (node === range.endContainer) ? range.endOffset : node.length;

      if (startOffset >= endOffset) return [];

      let targetNode = node;
      let effectiveEnd = endOffset;

      if (startOffset > 0) {
        targetNode = targetNode.splitText(startOffset);
        effectiveEnd = endOffset - startOffset;
      }

      if (effectiveEnd < targetNode.length) {
        targetNode.splitText(effectiveEnd);
      }

      const mark = wrapTextNode(targetNode);
      if (mark) createdMarks.push(mark);
      return createdMarks;
    }

    // CASE 2: Multi text-node selection
    const nodesWithOffsets = textNodes.map(node => {
      let start = (node === range.startContainer) ? range.startOffset : 0;
      let end = (node === range.endContainer) ? range.endOffset : node.length;
      return { node, start, end };
    });

    nodesWithOffsets.forEach(({ node, start, end }) => {
      if (start >= end) return;
      if (node.textContent.trim().length === 0 && start === 0 && end === node.length) return;

      let targetNode = node;
      let effectiveEnd = end;

      if (start > 0) {
        targetNode = targetNode.splitText(start);
        effectiveEnd = end - start;
      }

      if (effectiveEnd < targetNode.length) {
        targetNode.splitText(effectiveEnd);
      }

      const mark = wrapTextNode(targetNode);
      if (mark) createdMarks.push(mark);
    });

    return createdMarks;
  }

  function getSurroundingContext(range, charCount = 40) {
    const exact = range.toString();

    let prefix = '';
    try {
      const preRange = document.createRange();
      preRange.setStart(document.body, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      prefix = preRange.toString().slice(-charCount);
    } catch (e) {
      prefix = '';
    }

    let suffix = '';
    try {
      const postRange = document.createRange();
      postRange.setStart(range.endContainer, range.endOffset);
      postRange.setEnd(document.body, document.body.childNodes.length);
      suffix = postRange.toString().slice(0, charCount);
    } catch (e) {
      suffix = '';
    }

    return { exact, prefix, suffix };
  }

  function createAnchor(range, color = 'yellow', comment = '', paper = null) {
    const { exact, prefix, suffix } = getSurroundingContext(range);
    const startDesc = getTextNodeDescriptor(range.startContainer);
    const endDesc = getTextNodeDescriptor(range.endContainer);
    const id = generateId();

    return {
      id,
      color,
      comment: comment || '',
      exact,
      prefix,
      suffix,
      paper: paper || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startDesc: {
        ...startDesc,
        offset: range.startOffset
      },
      endDesc: {
        ...endDesc,
        offset: range.endOffset
      }
    };
  }

  function findRangeByContext(anchor) {
    const { exact, prefix, suffix } = anchor;
    if (!exact || exact.trim().length === 0) return null;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('.web-hl-ui-root')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let fullText = '';
    const nodeOffsets = [];
    let current;

    while ((current = walker.nextNode())) {
      const start = fullText.length;
      fullText += current.textContent;
      nodeOffsets.push({ node: current, start, end: fullText.length });
    }

    let matchIndex = -1;

    // Search 1: prefix + exact + suffix
    if (prefix && suffix) {
      const fullQuery = prefix + exact + suffix;
      const qIdx = fullText.indexOf(fullQuery);
      if (qIdx !== -1) {
        matchIndex = qIdx + prefix.length;
      }
    }

    // Search 2: prefix slice + exact
    if (matchIndex === -1 && prefix) {
      const shortPrefix = prefix.slice(-15);
      const qIdx = fullText.indexOf(shortPrefix + exact);
      if (qIdx !== -1) {
        matchIndex = qIdx + shortPrefix.length;
      }
    }

    // Search 3: exact string match
    if (matchIndex === -1) {
      matchIndex = fullText.indexOf(exact);
    }

    if (matchIndex === -1) return null;

    const matchEnd = matchIndex + exact.length;

    let startNode = null;
    let startNodeOffset = 0;
    let endNode = null;
    let endNodeOffset = 0;

    for (let i = 0; i < nodeOffsets.length; i++) {
      const item = nodeOffsets[i];

      if (!startNode && matchIndex >= item.start && (matchIndex < item.end || (matchIndex === item.end && i === nodeOffsets.length - 1))) {
        startNode = item.node;
        startNodeOffset = matchIndex - item.start;
      }

      if (!endNode && matchEnd > item.start && matchEnd <= item.end) {
        endNode = item.node;
        endNodeOffset = matchEnd - item.start;
      }

      if (startNode && endNode) break;
    }

    if (!startNode || !endNode) return null;

    try {
      const range = document.createRange();
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    } catch (e) {
      return null;
    }
  }

  function restoreHighlight(anchor) {
    let range = null;

    // Fast path: try exact XPath descriptor
    if (anchor.startDesc && anchor.endDesc) {
      const startNode = getTextNodeFromDescriptor(anchor.startDesc);
      const endNode = getTextNodeFromDescriptor(anchor.endDesc);

      if (startNode && endNode) {
        try {
          const testRange = document.createRange();
          testRange.setStart(startNode, Math.min(anchor.startDesc.offset, startNode.length));
          testRange.setEnd(endNode, Math.min(anchor.endDesc.offset, endNode.length));
          if (testRange.toString().trim() === anchor.exact.trim()) {
            range = testRange;
          }
        } catch (e) {
          range = null;
        }
      }
    }

    // Fallback path: search by context
    if (!range) {
      range = findRangeByContext(anchor);
    }

    if (!range) {
      return null;
    }

    const marks = wrapRange(range, anchor.id, anchor.color || 'yellow');
    return marks;
  }

  function removeHighlightFromDOM(highlightId) {
    const marks = document.querySelectorAll(`mark[data-hl-id="${highlightId}"]`);
    marks.forEach(mark => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  return {
    generateId,
    createAnchor,
    wrapRange,
    restoreHighlight,
    removeHighlightFromDOM
  };
})();

window.WebHighlighterAnchor = WebHighlighterAnchor;
