/**
 * Prism-based syntax highlighting for the "Code editor" preview mode.
 *
 * This module is loaded via dynamic `import()` from FilePreview.tsx, so
 * Prism core + the language grammars below land in a separate lazy chunk
 * that is only fetched when the user actually previews a code file.
 *
 * Every language here is OPTED IN explicitly — the output is always either
 * Prism's tokenized HTML (input is escaped by Prism before tokenizing) or,
 * for an unknown language, HTML-escaped plain text. A code file can never be
 * injected into the DOM as executable markup.
 */

import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'

// Core + dependencies first (Prism grammars register onto Prism.languages).
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-markup' // html, xml, php
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-graphql'

function escapeHtml(source: string): string {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function highlightCode(code: string, lang: string): string {
  const grammar = Prism.languages[lang]
  if (!grammar) {
    // No grammar registered → render escaped plain text. Never raw.
    return escapeHtml(code)
  }
  try {
    return Prism.highlight(code, grammar, lang)
  } catch {
    return escapeHtml(code)
  }
}