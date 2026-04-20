/**
 * Client-side HTML → structured tree serializer.
 *
 * Returned as a JS string that gets passed to `page.evaluate`. The expression
 * walks the DOM subtree rooted at the first selector match (or documentElement
 * when no selector is given) and emits a compact `{tag, attrs, text, children}`
 * tree for agents to consume instead of re-parsing raw HTML.
 *
 * Text handling: `text` is the concatenated text of direct text children only,
 * whitespace-collapsed. Nested element text is left inside `children[].text`.
 * Ordering between text and elements is not preserved — agents that need it
 * should fall back to raw HTML mode.
 */

export interface BuildHtmlTreeJsOptions {
    /** CSS selector to scope the tree; unscoped = documentElement */
    selector?: string | null;
}

/**
 * Returns a JS expression string. When evaluated in a page context the
 * expression resolves to either
 *   `{selector, matched: number, tree: HtmlNode | null}` on success, or
 *   `{selector, invalidSelector: true, reason}` when `querySelectorAll`
 *   throws a `SyntaxError` for an unparseable selector.
 *
 * Callers must branch on `invalidSelector` to convert it into the CLI's
 * `invalid_selector` structured error; otherwise the browser-level exception
 * would bubble out of `page.evaluate` and bypass the structured-error
 * contract that agents rely on.
 */
export function buildHtmlTreeJs(opts: BuildHtmlTreeJsOptions = {}): string {
    const selectorLiteral = opts.selector ? JSON.stringify(opts.selector) : 'null';
    return `(() => {
  const selector = ${selectorLiteral};
  let matches;
  if (selector) {
    try { matches = document.querySelectorAll(selector); }
    catch (e) {
      return { selector: selector, invalidSelector: true, reason: (e && e.message) || String(e) };
    }
  } else {
    matches = [document.documentElement];
  }
  const matched = matches.length;
  const root = matches[0] || null;
  function serialize(el) {
    if (!el || el.nodeType !== 1) return null;
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value;
    let text = '';
    const children = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        text += n.nodeValue;
      } else if (n.nodeType === 1) {
        const child = serialize(n);
        if (child) children.push(child);
      }
    }
    return { tag: el.tagName.toLowerCase(), attrs, text: text.replace(/\\s+/g, ' ').trim(), children };
  }
  return { selector: selector, matched: matched, tree: root ? serialize(root) : null };
})()`;
}

export interface HtmlNode {
    tag: string;
    attrs: Record<string, string>;
    text: string;
    children: HtmlNode[];
}

export interface HtmlTreeResult {
    selector: string | null;
    matched: number;
    tree: HtmlNode | null;
}
