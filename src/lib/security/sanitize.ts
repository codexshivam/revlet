/**
 * @fileOverview Input Sanitization and XSS Prevention Utility
 * Hardens user inputs against script injection, Self-XSS, and malicious payloads.
 */

// Patterns matching executable scripts and dangerous pseudo-protocols
const SCRIPT_TAG_REGEX = /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\b[^>]*>/gi;
const JAVASCRIPT_PROTOCOL_REGEX = /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi;
const INLINE_EVENT_HANDLER_REGEX = /\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_EXPRESSIONS_REGEX = /(?:eval|new\s+Function|document\s*\.\s*cookie|window\s*\.\s*localStorage|document\s*\.\s*location)\b/gi;

/**
 * Checks if a string contains executable script tags, event handlers, or script protocols.
 */
export function containsMaliciousScript(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  return (
    SCRIPT_TAG_REGEX.test(input) ||
    JAVASCRIPT_PROTOCOL_REGEX.test(input) ||
    INLINE_EVENT_HANDLER_REGEX.test(input) ||
    DANGEROUS_EXPRESSIONS_REGEX.test(input)
  );
}

/**
 * Character-level HTML tag stripper (avoids incomplete multi-character regex sanitization).
 */
function stripHtmlTagsLinear(input: string): string {
  let out = '';
  let inTag = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '<') {
      inTag = true;
    } else if (ch === '>') {
      inTag = false;
    } else if (!inTag) {
      out += ch;
    }
  }
  return out;
}

/**
 * Aggressively strips script tags, event handlers, and dangerous protocols from input.
 * Preserves normal text, punctuation, emails, URLs, and multi-line formatting.
 */
export function stripScripts(input: string, options?: { allowHtml?: boolean; maxLength?: number }): string {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input;

  if (!options?.allowHtml) {
    sanitized = stripHtmlTagsLinear(sanitized).replace(/[<>]/g, '');
  } else {
    let previous = '';
    do {
      previous = sanitized;
      sanitized = sanitized
        .replace(SCRIPT_TAG_REGEX, '')
        .replace(INLINE_EVENT_HANDLER_REGEX, '');
    } while (sanitized !== previous);
  }

  let prevProto = '';
  do {
    prevProto = sanitized;
    sanitized = sanitized.replace(JAVASCRIPT_PROTOCOL_REGEX, '');
  } while (sanitized !== prevProto);

  // 5. Normalize null bytes and invisible control characters (preserve newlines/tabs)
  sanitized = sanitized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  // 6. Enforce maximum length if specified
  if (options?.maxLength && options.maxLength > 0) {
    sanitized = sanitized.slice(0, options.maxLength);
  }

  return sanitized.trim();
}

/**
 * Escapes characters for safe display in environments that interpret raw HTML.
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates text inputs (e.g. names, titles, descriptions) and returns
 * either the sanitized string or an error message if dangerous script patterns were detected.
 */
export function validateAndSanitizeInput(
  input: string,
  fieldName = 'Field',
  options?: { maxLength?: number; required?: boolean }
): { isValid: boolean; sanitized: string; error?: string } {
  const trimmed = input ? input.trim() : '';

  if (options?.required && !trimmed) {
    return { isValid: false, sanitized: '', error: `${fieldName} is required.` };
  }

  if (containsMaliciousScript(trimmed)) {
    return {
      isValid: false,
      sanitized: stripScripts(trimmed, { maxLength: options?.maxLength }),
      error: `${fieldName} contains disallowed script or executable content.`,
    };
  }

  const clean = stripScripts(trimmed, { maxLength: options?.maxLength });
  return { isValid: true, sanitized: clean };
}
