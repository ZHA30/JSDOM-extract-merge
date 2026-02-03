/**
 * HTML Parser Module using Cheerio
 * Handles text extraction and translation merging
 */

import * as cheerio from 'cheerio';

/**
 * Block-level container tags that should be processed
 */
const CONTAINER_TAGS = new Set([
  'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section',
  'article', 'aside', 'blockquote', 'dd', 'dt', 'dl', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'header', 'main', 'nav', 'ol', 'ul', 'td', 'th',
  'tr', 'tbody', 'thead', 'tfoot'
]);

/**
 * Inline tags that should be preserved within text segments
 */
const INLINE_TAGS = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 'span', 'mark', 'small', 'sub', 'sup',
  'time', 'code', 'q', 's', 'strike', 'del', 'ins', 'abbr', 'acronym', 'cite',
  'dfn'
]);

/**
 * Tags to exclude (removed before processing)
 */
const EXCLUDED_TAGS = new Set([
  'script', 'style', 'pre', 'code', 'canvas', 'svg', 'noscript', 'iframe',
  'video', 'audio', 'object', 'embed', 'applet', 'form', 'input', 'textarea',
  'select', 'button', 'meta', 'link'
]);

/**
 * Generate a unique segment ID based on the DOM path
 * Format: body.div[0].p[2].a[1] -> Base64 encoded
 *
 * @param {CheerioElement} element - The Cheerio element
 * @param {CheerioAPI} $ - Cheerio instance
 * @returns {string} Base64-encoded path hash
 */
function generateSegmentId(element, $) {
  const path = [];
  let current = element;

  while (current.parent && current.parent.type !== 'root') {
    const tagName = current.name || 'text';
    const parent = $(current.parent);
    const siblings = parent.children();
    
    // Find index among siblings of same type
    let index = 0;
    siblings.each((i, sibling) => {
      const siblingName = sibling.name || 'text';
      if (siblingName === tagName && siblings.get(i) === current) {
        return false; // Found match
      }
      if (siblingName === tagName) {
        index++;
      }
    });

    path.unshift(`${tagName}[${index}]`);
    current = current.parent;
  }

  path.unshift('html');
  const pathString = path.join('.');
  return Buffer.from(pathString).toString('base64');
}

/**
 * Default options for extraction
 */
const DEFAULT_EXTRACT_OPTIONS = {
  extractAttributes: [],
  ignoredClasses: [],
  preserveWhitespace: false
};

/**
 * Extract text segments from HTML
 *
 * @param {string} html - The HTML content to parse
 * @param {Object} options - Extraction options
 * @returns {Array<{id: string, text: string, attributes: Object}>} Array of segments
 */
export function extractTextSegments(html, options = {}) {
  const opts = { ...DEFAULT_EXTRACT_OPTIONS, ...options };
  
  // Parse HTML with decodeEntities: false to prevent encoding issues
  const $ = cheerio.load(html, {
    decodeEntities: false,
    xmlMode: false
  });

  // Remove excluded tags and their content
  EXCLUDED_TAGS.forEach(tag => {
    $(tag).remove();
  });

  const segments = [];
  const processedIds = new Set();

  // Traverse container elements
  $('*').each((index, element) => {
    const tagName = element.tagName?.toLowerCase();
    
    // Skip if not a container tag, has ignored classes, or already processed
    if (!CONTAINER_TAGS.has(tagName)) {
      return;
    }

    // Check for ignored classes
    if (opts.ignoredClasses.length > 0) {
      const $element = $(element);
      const hasIgnoredClass = opts.ignoredClasses.some(cls => 
        $element.hasClass(cls)
      );
      if (hasIgnoredClass) {
        return;
      }
    }

    const $element = $(element);
    
    // Skip if element only contains whitespace or no direct text
    const textContent = $element.text().trim();
    if (!textContent) {
      return;
    }

    // Generate unique segment ID
    const segId = generateSegmentId(element, $);
    
    // Skip if already processed (nested elements)
    if (processedIds.has(segId)) {
      return;
    }
    processedIds.add(segId);

    // Extract text with inline tags preserved
    let segmentText = '';
    const children = $element.contents();
    
    children.each((idx, child) => {
      if (child.type === 'text') {
        segmentText += opts.preserveWhitespace ? child.data : child.data.replace(/\s+/g, ' ').trim();
      } else if (child.type === 'tag') {
        const childTag = child.tagName?.toLowerCase();
        // Preserve inline tags
        if (INLINE_TAGS.has(childTag)) {
          segmentText += $.html(child);
        }
        // Ignore other nested container tags (they will be processed separately)
      }
    });

    // Trim and ensure we have content
    segmentText = segmentText.trim();
    if (!segmentText) {
      return;
    }

    // Extract requested attributes
    const attributes = {};
    if (opts.extractAttributes.length > 0) {
      opts.extractAttributes.forEach(attrName => {
        const attrValue = $element.attr(attrName);
        if (attrValue) {
          attributes[attrName] = attrValue;
        }
      });
    }

    segments.push({
      id: segId,
      text: segmentText,
      path: Buffer.from(segId, 'base64').toString('utf-8'),
      tag: tagName,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined
    });
  });

  return segments;
}

/**
 * Check for unclosed tags in HTML
 *
 * @param {string} html - HTML to validate
 * @returns {boolean} True if valid, false if issues found
 */
export function validateHtmlStructure(html) {
  try {
    cheerio.load(html, { decodeEntities: false });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fast check for obvious unclosed tags
 *
 * @param {string} text - Text to check
 * @returns {{isValid: boolean, missingTags: Array<string>}}
 */
export function checkUnclosedTags(text) {
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  const closeTagPattern = /<\/([a-zA-Z][a-zA-Z0-9]*)>/g;
  
  const openMatches = text.match(tagPattern) || [];
  const closeMatches = text.match(closeTagPattern) || [];
  
  const openTags = new Map();
  const closeTags = new Map();
  
  openMatches.forEach(match => {
    const tagName = match.match(/<([a-zA-Z][a-zA-Z0-9]*)/)[1];
    if (!match.startsWith('</') && !match.endsWith('/>')) {
      // Self-closing and void tags
      const voidTags = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'command', 'embed', 'keygen', 'param', 'source', 'track', 'wbr']);
      if (!voidTags.has(tagName.toLowerCase())) {
        openTags.set(tagName, (openTags.get(tagName) || 0) + 1);
      }
    }
  });
  
  closeMatches.forEach(match => {
    const tagName = match.match(/<\/([a-zA-Z][a-zA-Z0-9]*)/)[1];
    closeTags.set(tagName, (closeTags.get(tagName) || 0) + 1);
  });
  
  const missingTags = [];
  for (const [tag, openCount] of openTags) {
    const closeCount = closeTags.get(tag) || 0;
    if (openCount > closeCount) {
      missingTags.push(tag);
    }
  }
  
  return {
    isValid: missingTags.length === 0,
    missingTags
  };
}

/**
 * Default options for merging
 */
const DEFAULT_MERGE_OPTIONS = {
  safetyCheck: true
};

/**
 * Merge translated text segments back into HTML
 *
 * @param {string} html - The original HTML
 * @param {Array<{id: string, text: string}>} translations - Translated segments with IDs
 * @param {Object} options - Merge options
 * @returns {string} The merged HTML
 * @throws {Error} If segment ID not found or HTML structure invalid
 */
export function mergeTranslations(html, translations, options = {}) {
  const opts = { ...DEFAULT_MERGE_OPTIONS, ...options };
  
  // Validate HTML structure
  if (!validateHtmlStructure(html)) {
    const error = new Error('Invalid HTML structure');
    error.code = 'INVALID_STRUCTURE';
    throw error;
  }

  // Safety check for each translation
  if (opts.safetyCheck) {
    for (const trans of translations) {
      if (trans.text) {
        const check = checkUnclosedTags(trans.text);
        if (!check.isValid && check.missingTags.length > 0) {
          const error = new Error(
            `Unclosed tags detected in translation: ${check.missingTags.join(', ')}`
          );
          error.code = 'UNCLOSED_TAGS';
          error.details = check;
          throw error;
        }
      }
    }
  }

  // Parse original HTML
  const $ = cheerio.load(html, {
    decodeEntities: false,
    xmlMode: false
  });

  // Build lookup map for translations
  const translationMap = new Map();
  translations.forEach(t => {
    translationMap.set(t.id, t.text);
  });

  const mergedCount = { value: 0 };
  const missingSegments = [];

  // Reconstruct DOM and find elements by path
  translations.forEach(({ id }) => {
    const path = Buffer.from(id, 'base64').toString('utf-8');
    const pathParts = path.split('.');
    
    // Skip if translation text not provided
    if (!translationMap.has(id)) {
      return;
    }

    // Traverse to element using path
    let $current = $.root();
    let found = true;

    for (let i = 1; i < pathParts.length; i++) {
      const part = pathParts[i];
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      
      if (!match) {
        found = false;
        break;
      }

      const [, tagName, index] = match;
      const children = $current.children();
      let currentCount = 0;
      
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        const childTag = child.tagName?.toLowerCase();
        
        if (childTag === tagName || (tagName === 'text' && child.type === 'text')) {
          if (currentCount === parseInt(index, 10)) {
            $current = $(child);
            break;
          }
          currentCount++;
        }
      }
      
      if (currentCount > parseInt(index, 10)) {
        found = false;
        break;
      }
    }

    if (found && $current.length > 0) {
      // Replace content
      const translatedText = translationMap.get(id);
      $current.html(translatedText);
      mergedCount.value++;
    } else {
      missingSegments.push(id);
    }
  });

  // Throw error if any segments not found
  if (missingSegments.length > 0) {
    const error = new Error(
      `Segments not found in original HTML: ${missingSegments.length} segments missing`
    );
    error.code = 'MISSING_SEGMENTS';
    error.details = missingSegments;
    throw error;
  }

  return $.html();
}
