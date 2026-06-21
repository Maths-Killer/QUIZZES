/**
 * textParser.js — Converts the bundled question schema's embedded image
 * token format into safe, responsive HTML.
 *
 * Token format: [IMG]url_path[/IMG]  (case-insensitive on the tag itself)
 *
 * Security note: question/explanation text is bundled, trusted, static JSON
 * — not user-submitted at runtime in the general case. HOWEVER, the In-App
 * Data Portal *does* allow live entry of new question objects, so we still
 * escape any plain-text portions to prevent stored-HTML issues if someone
 * pastes raw HTML into a question field via the portal.
 */

const IMG_TOKEN_RE = /\[IMG\](.*?)\[\/IMG\]/gi;

/**
 * Resolves an image path against Vite's BASE_URL so absolute paths like
 * "/assets/foo.jpg" written in bundled JSON data correctly resolve once
 * deployed under a subpath (e.g. GitHub Pages serving from
 * /QUIZZES/ rather than the domain root).
 *
 * import.meta.env.BASE_URL is Vite's own environment-aware base path —
 * it's "/" in local dev and whatever `base` is set to in vite.config.js
 * during production builds (currently "/QUIZZES/"). This means data
 * files can keep writing plain "/assets/foo.jpg" paths; no path rewriting
 * is ever needed in the data itself, regardless of where the app is
 * eventually hosted or if the repo is renamed.
 *
 * Paths that are already absolute URLs (http://, https://, data:) or
 * already relative (no leading slash) are passed through unchanged —
 * only root-relative paths ("/...") get the base prefix applied.
 */
function resolveAssetPath(rawPath) {
  if (!rawPath) return rawPath;
  if (/^(https?:)?\/\//.test(rawPath) || rawPath.startsWith('data:')) return rawPath;
  if (!rawPath.startsWith('/')) return rawPath;

  const base = import.meta.env?.BASE_URL || '/';
  // Avoid double slashes when joining e.g. base "/QUIZZES/" + path "/assets/x.jpg"
  return base.replace(/\/$/, '') + rawPath;
}

/** Escapes the five HTML-significant characters. */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a text field that may contain embedded [IMG]...[/IMG] tokens
 * into an HTML string safe to inject via innerHTML.
 *
 * Splits the string on the token regex, escapes every plain-text segment,
 * and rebuilds <img> tags only for matched segments — so arbitrary HTML
 * typed into the Data Portal can never execute, but legitimate image
 * tokens still render.
 *
 * @param {string} rawText
 * @returns {string} HTML-safe string ready for innerHTML
 */
export function renderTextWithImages(rawText) {
  if (!rawText) return '';

  let result = '';
  let lastIndex = 0;
  let match;

  // Reset regex state since it's a shared `g` regex.
  IMG_TOKEN_RE.lastIndex = 0;

  while ((match = IMG_TOKEN_RE.exec(rawText)) !== null) {
    const [fullMatch, url] = match;
    const matchStart = match.index;

    // Escape and append the plain-text segment before this image token.
    result += escapeHtml(rawText.slice(lastIndex, matchStart));

    const safeUrl = escapeHtml(resolveAssetPath(url.trim()));
    result += `<img src="${safeUrl}" class="max-w-full h-auto rounded-md shadow-sm my-2 block" loading="lazy" alt="Question diagram" />`;

    lastIndex = matchStart + fullMatch.length;
  }

  // Append whatever plain text remains after the last token.
  result += escapeHtml(rawText.slice(lastIndex));

  return result;
}

/**
 * Strips [IMG]...[/IMG] tokens entirely, leaving just the plain text.
 * Useful for the Search Center index (we don't want to full-text-search
 * raw image URLs) and for plain-text previews in list views.
 */
export function stripImageTokens(rawText) {
  if (!rawText) return '';
  return rawText.replace(IMG_TOKEN_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Returns true if the given text contains at least one image token.
 * Cheap existence check without doing the full render.
 */
export function hasImageToken(rawText) {
  if (!rawText) return false;
  IMG_TOKEN_RE.lastIndex = 0;
  return IMG_TOKEN_RE.test(rawText);
}

// ---------------------------------------------------------------------------
// Rich summary rendering — markdown-SUBSET, not full Markdown.
//
// This is intentionally a separate function from renderTextWithImages()
// above, NOT a modification of it. questionText/explanation/reference are
// short single-purpose strings already in production use; retroactively
// teaching them to interpret "**" or "#" as formatting risks misrendering
// existing bundled content that happens to contain a literal asterisk or
// "#" leading character. summaryText is a NEW, opt-in field for long-form
// textbook-style content, so it gets its own renderer with its own rules.
//
// Supported tokens (deliberately small surface area — full Markdown/HTML
// would reopen the injection risk we're avoiding):
//   [IMG]url[/IMG]                 -> <img>            (existing token, reused)
//   # Heading text                 -> <h3> (line must start with "# ")
//   ## Subheading text             -> <h4> (line must start with "## ")
//   **bold text**                  -> <strong>
//   *italic text*                  -> <em>
//   [COLOR=red]text[/COLOR]        -> <span class="text-{red}-600">
//     allowed color names are an explicit allow-list (see COLOR_CLASS_MAP)
//     so arbitrary class names can never be injected via this token.
//   \n\n                            -> paragraph break (handled by the
//                                      whitespace-pre-line Tailwind class
//                                      at the call site, NOT by this
//                                      function — we don't convert
//                                      newlines to <br> here, to avoid
//                                      double-spacing when combined with
//                                      that CSS rule)
//
// Everything else is escaped exactly like renderTextWithImages() does.
// ---------------------------------------------------------------------------

const COLOR_CLASS_MAP = {
  red: 'text-red-600',
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  purple: 'text-purple-600',
  slate: 'text-slate-500',
};

const COLOR_TOKEN_RE = /\[COLOR=([a-zA-Z]+)\](.*?)\[\/COLOR\]/g;
const BOLD_TOKEN_RE = /\*\*(.+?)\*\*/g;
const ITALIC_TOKEN_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
const H2_LINE_RE = /^##\s+(.+)$/;
const H1_LINE_RE = /^#\s+(.+)$/;

/**
 * Renders a single line of already-escaped text, substituting bold/italic/
 * color inline tokens. Operates on ESCAPED text (so the regexes below match
 * literal "*" and "[" characters, which escaping never touches) and only
 * ever wraps matched groups in pre-approved tags/classes — it never lets
 * matched text become a tag or attribute name itself.
 */
function applyInlineTokens(escapedLine) {
  let line = escapedLine;

  line = line.replace(COLOR_TOKEN_RE, (full, colorName, inner) => {
    const cls = COLOR_CLASS_MAP[colorName.toLowerCase()];
    if (!cls) return inner; // unknown color name: drop the wrapper, keep the text
    return `<span class="${cls}">${inner}</span>`;
  });

  line = line.replace(BOLD_TOKEN_RE, '<strong>$1</strong>');
  line = line.replace(ITALIC_TOKEN_RE, '<em>$1</em>');

  return line;
}

/**
 * Renders one logical line as a block element if it matches a heading
 * pattern, otherwise returns null (caller treats it as a plain paragraph
 * line). Headings are matched on the RAW (pre-escape) line so the leading
 * "#"/"##" + space prefix is reliably detected, then the heading's inner
 * text is escaped and inline-token-processed exactly like a normal line.
 */
function renderHeadingLine(rawLine) {
  const h2Match = rawLine.match(H2_LINE_RE);
  if (h2Match) {
    return `<h4 class="text-sm font-bold text-slate-700 mt-3 mb-1">${applyInlineTokens(escapeHtml(h2Match[1]))}</h4>`;
  }
  const h1Match = rawLine.match(H1_LINE_RE);
  if (h1Match) {
    return `<h3 class="text-base font-bold text-slate-800 mt-4 mb-1.5">${applyInlineTokens(escapeHtml(h1Match[1]))}</h3>`;
  }
  return null;
}

/**
 * Renders a textbook-style summary field: supports [IMG] tokens (reusing
 * the exact same image-handling pass as renderTextWithImages), plus a
 * deliberately small markdown-subset for bold/italic/headers/color, with
 * paragraph breaks left as literal \n\n for the caller to render via the
 * `whitespace-pre-line` Tailwind utility class.
 *
 * Process order matters: we first split on [IMG] tokens (same regex/logic
 * as renderTextWithImages) so image URLs are never run through the
 * markdown-subset substitutions. Then, for each plain-text segment between
 * images, we process line-by-line so heading detection works against
 * actual line starts rather than the whole multi-paragraph blob.
 *
 * @param {string} rawText
 * @returns {string} HTML-safe string ready for innerHTML
 */
export function renderRichSummaryText(rawText) {
  if (!rawText) return '';

  let result = '';
  let lastIndex = 0;
  let match;

  IMG_TOKEN_RE.lastIndex = 0;

  while ((match = IMG_TOKEN_RE.exec(rawText)) !== null) {
    const [fullMatch, url] = match;
    const matchStart = match.index;

    result += renderPlainSegmentWithMarkdown(rawText.slice(lastIndex, matchStart));

    const safeUrl = escapeHtml(resolveAssetPath(url.trim()));
    result += `<img src="${safeUrl}" class="max-w-full h-auto rounded-md shadow-sm my-3 block" loading="lazy" alt="Summary diagram" />`;

    lastIndex = matchStart + fullMatch.length;
  }

  result += renderPlainSegmentWithMarkdown(rawText.slice(lastIndex));

  return result;
}

/** Processes one [IMG]-free segment: line-by-line heading detection + inline token substitution, leaving \n\n intact for whitespace-pre-line. */
function renderPlainSegmentWithMarkdown(segment) {
  if (!segment) return '';

  return segment
    .split('\n')
    .map((rawLine) => {
      const heading = renderHeadingLine(rawLine);
      if (heading !== null) return heading;
      return applyInlineTokens(escapeHtml(rawLine));
    })
    .join('\n');
}
