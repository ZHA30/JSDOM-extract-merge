import * as cheerio from 'cheerio';
import crypto from 'crypto';

// Block-level container tags that should be extracted as segments
const CONTAINER_TAGS = [
  'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'section', 'article', 'aside', 'blockquote', 'dd', 'dt', 'dl',
  'fieldset', 'figcaption', 'figure', 'footer', 'header', 'main',
  'nav', 'ol', 'ul', 'td', 'th', 'tr', 'tbody', 'thead', 'tfoot'
];

// Inline tags that should be preserved within extracted text
const INLINE_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 'span', 'mark', 'small',
  'sub', 'sup', 'time', 'q', 's', 'strike', 'del', 'ins', 'abbr',
  'acronym', 'cite', 'dfn'
];

// Tags to completely exclude
const EXCLUDED_TAGS = [
  'script', 'style', 'pre', 'code', 'canvas', 'svg', 'noscript',
  'iframe', 'video', 'audio', 'object', 'embed', 'applet', 'meta', 'link'
];

// Attributes that should be extracted (for translation)
const EXTRACTABLE_ATTRIBUTES = ['alt', 'placeholder', 'title'];

/**
 * Extract text segments from HTML
 * @param {string} html - The HTML content
 * @param {object} options - Extraction options
 * @returns {Array} Extracted segments with id, text, path, tag, attributes
 */
export function extractTextSegments(html, options = {}) {
  const {
    extractAttributes = [],
    ignoredClasses = [],
    preserveWhitespace = false
  } = options;

  // Load HTML without decoding entities to preserve original encoding
  const $ = cheerio.load(html, { decodeEntities: false });
  const segments = [];

  // Find all container elements that have text content
  const selector = CONTAINER_TAGS.join(',');
  $(selector).each((index, element) => {
    const $element = $(element);
    const tagName = element.tagName;

    // Skip if element is inside an excluded tag
    if (isInsideExcludedTag($element)) {
      return;
    }

    // Skip if element has ignored classes
    if (hasIgnoredClass($element, ignoredClasses)) {
      return;
    }

    // Get the path hash as segment ID
    const path = getPath($element);
    const segId = generatePathHash(path);

    // Extract HTML content including inline tags
    let text = preserveWhitespace ? $element.html() : normalizeWhitespace($element.html());
    text = extractInlineAttributes($element, text, extractAttributes);

    if (text && text.trim()) {
      segments.push({
        id: segId,
        text: text,
        path: path,
        tag: tagName,
        attributes: extractElementAttributes($element, extractAttributes)
      });
    }
  });

  return segments;
}

/**
 * Merge translated text back into HTML
 * @param {string} html - Original HTML
 * @param {Array} translations - Array of {id, text} translations
 * @param {object} options - Merge options
 * @returns {string} Merged HTML
 */
export function mergeTranslations(html, translations = [], options = {}) {
  const { safetyCheck = true } = options;

  if (safetyCheck) {
    for (const translation of translations) {
      const { isValid, missingTags } = checkUnclosedTags(translation.text);
      if (!isValid) {
        throw new Error(`Unclosed tags detected in translation ${translation.id}: ${missingTags.join(', ')}`);
      }
    }
  }

  // Load HTML without decoding entities
  const $ = cheerio.load(html, { decodeEntities: false });

  let successCount = 0;
  const missingIds = [];

  for (const translation of translations) {
    const { id, text } = translation;

    // Find element by path hash
    const $element = findElementByPathHash($, id);

    if ($element.length === 0) {
      missingIds.push(id);
      continue;
    }

    // Replace the HTML content
    $element.html(text);
    successCount++;
  }

  if (missingIds.length > 0 && options.options?.strictMode) {
    throw new Error(`Segment IDs not found in HTML: ${missingIds.join(', ')}`);
  }

  return $.html();
}

/**
 * Check for unclosed tags in HTML string
 * @param {string} text - HTML string to check
 * @returns {object} {isValid: boolean, missingTags: Array}
 */
export function checkUnclosedTags(text) {
  const stack = [];
  const missingTags = [];

  // Parse tags
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();

    // Skip self-closing tags
    if (fullMatch.endsWith('/>') || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName)) {
      continue;
    }

    if (fullMatch.startsWith('</')) {
      // Closing tag
      const lastOpen = stack.lastIndexOf(tagName);
      if (lastOpen === -1) {
        missingTags.push(tagName);
        continue;
      }
      stack.splice(lastOpen, 1);
    } else if (!fullMatch.match(/\/\s*>$/)) {
      // Opening tag (not self-closing)
      stack.push(tagName);
    }
  }

  return {
    isValid: missingTags.length === 0 && stack.length === 0,
    missingTags: [...missingTags, ...stack]
  };
}

/**
 * Check if element is inside an excluded tag
 * @param {Cheerio} $element - Cheerio element
 * @returns {boolean}
 */
function isInsideExcludedTag($element) {
  let $current = $element.parent();
  while ($current.length > 0) {
    const tagName = $current[0].tagName;
    if (EXCLUDED_TAGS.includes(tagName)) {
      return true;
    }
    $current = $current.parent();
  }
  return false;
}

/**
 * Check if element has any ignored classes
 * @param {Cheerio} $element - Cheerio element
 * @param {Array} ignoredClasses - Class names to ignore
 * @returns {boolean}
 */
function hasIgnoredClass($element, ignoredClasses) {
  if (!ignoredClasses || ignoredClasses.length === 0) {
    return false;
  }
  const classes = $element.attr('class') || '';
  const elementClasses = classes.split(/\s+/).filter(Boolean);
  return ignoredClasses.some(ignored => elementClasses.includes(ignored));
}

/**
 * Get CSS path for an element
 * @param {Cheerio} $element - Cheerio element
 * @returns {string} CSS path string
 */
function getPath($element) {
  const path = [];
  let $current = $element;

  while ($current.length > 0) {
    const tagName = $current[0].tagName;

    // Add tag to path (with index for non-root elements)
    if (tagName === 'html' || tagName === 'body') {
      path.unshift(`${tagName}`);
    } else {
      // Find index among siblings
      const siblings = $current.parent().children().filter(function() {
        return this.tagName === tagName;
      });
      const index = siblings.index($current);
      path.unshift(`${tagName}[${index}]`);
    }

    // Move to parent
    const prevCurrent = $current;
    $current = $current.parent();

    // Stop if we've reached html (after adding it to path)
    if ($current.length === 0 || (prevCurrent[0]?.tagName === 'html')) {
      break;
    }
  }

  return path.join('.');
}

/**
 * Generate a hash from element path
 * @param {string} path - CSS path
 * @returns {string} Base64 encoded hash
 */
function generatePathHash(path) {
  return Buffer.from(path).toString('base64');
}

/**
 * Find element by path hash
 * @param {Cheerio} $ - Cheerio instance
 * @param {string} hash - Base64 encoded path hash
 * @returns {Cheerio} Element or empty
 */
function findElementByPathHash($, hash) {
  try {
    const path = Buffer.from(hash, 'base64').toString('utf-8');
    const parts = path.split('.');

    // Start from the root (html tag)
    let $element = $.root();

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.includes('[') && part.includes(']')) {
        // Tag with index: body[0], div[0], p[2]
        const [tag, indexStr] = part.split('[');
        const index = parseInt(indexStr.replace(']', ''), 10);

        // Find children with this tag name
        const childrenArray = $element.children().toArray();
        const matchingChildren = childrenArray.filter(child => child.tagName === tag);

        if (matchingChildren.length > index) {
          $element = $(matchingChildren[index]);
        } else {
          return $([]);
        }
      } else {
        // Simple tag (html, body - without index)
        const childrenArray = $element.children().toArray();
        const matchingChild = childrenArray.find(child => child.tagName === part);
        if (matchingChild) {
          $element = $(matchingChild);
        } else {
          return $([]);
        }
      }

      if ($element.length === 0) {
        return $([]);
      }
    }

    return $element;
  } catch (error) {
    console.error('Error finding element by path hash:', error);
    return $([]);
  }
}

/**
 * Extract inline attributes from element
 * @param {Cheerio} $element - Cheerio element
 * @param {string} text - Inner HTML text
 * @param {Array} attributesToExtract - Attributes to extract
 * @returns {string} Modified text with attributes
 */
function extractInlineAttributes($element, text, attributesToExtract) {
  if (!attributesToExtract || attributesToExtract.length === 0) {
    return text;
  }

  // Add data- attributes for extractable inline attributes
  attributesToExtract.forEach(attr => {
    const attrValue = $element.find(`[${attr}]`).first().attr(attr);
    if (attrValue) {
      // Add as data attribute to preserve for translation
      const $newText = cheerio.load(text);
      $newText('[' + attr + ']').attr('data-' + attr, attrValue);
      text = $newText.html();
    }
  });

  return text;
}

/**
 * Extract specific attributes from element
 * @param {Cheerio} $element - Cheerio element
 * @param {Array} attributes - Attributes to extract
 * @returns {object} Extracted attributes
 */
function extractElementAttributes($element, attributes) {
  const extracted = {};

  // Get attributes for img, a, input, etc.
  if ($element[0].tagName === 'img' && attributes.includes('alt')) {
    extracted.alt = $element.attr('alt');
  }

  if ($element[0].tagName === 'a' && attributes.includes('title')) {
    extracted.title = $element.attr('title');
  }

  if ($element[0].tagName === 'input' && attributes.includes('placeholder')) {
    extracted.placeholder = $element.attr('placeholder');
  }

  return extracted;
}

/**
 * Normalize whitespace in HTML
 * @param {string} html - HTML string
 * @returns {string} Normalized HTML
 */
function normalizeWhitespace(html) {
  if (!html) return '';
  return html.replace(/\s+/g, ' ').trim();
}
