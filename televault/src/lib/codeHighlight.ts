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

// The prismjs component files register their grammars onto the GLOBAL Prism
// instance (`_self.Prism`), not onto the `prismjs` module's default export,
// so the side-effect imports below populate `window.Prism.languages`. Merge
// those grammars onto the module instance so both point at the same tables.
const globalPrism = typeof window !== 'undefined' && (window as any).Prism
if (globalPrism && globalPrism.languages) {
  Object.assign(Prism.languages, globalPrism.languages)
}
const prism = Prism

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

/**
 * Serialize a Prism token stream to escaped HTML. Every string leaf is the
 * ORIGINAL file text (Prism never synthesizes markup), so escaping it yields
 * tokens that can never execute — only color. Never uses dangerously-injected
 * raw file content.
 */
function serializeTokens(input: unknown): string {
  if (typeof input === 'string') return escapeHtml(input)
  if (Array.isArray(input)) return input.map(serializeTokens).join('')
  const tok = input as { type?: string; content?: unknown; alias?: string | string[] }
  if (tok.type === undefined) return escapeHtml(String(tok.content ?? ''))
  const aliases = Array.isArray(tok.alias) ? tok.alias : tok.alias ? [tok.alias] : []
  const cls = ['token', tok.type, ...aliases].filter(Boolean).join(' ')
  return `<span class="${cls}">${serializeTokens(tok.content)}</span>`
}

export function highlightCode(code: string, lang: string): string {
  const grammar = prism.languages[lang]
  if (!grammar) {
    // No grammar registered → render escaped plain text. Never raw.
    return escapeHtml(code)
  }
  try {
    // Tokenize per line: Prism's own `highlight` relies on a `Token.stringify`
    // helper that the bundler strips out of the CJS build, and the preview
    // layer line-splits its output anyway. Tokenizing one line at a time means
    // every token span starts and closes on the same line, so the split can
    // never produce broken half-opened markup. Multi-line constructs (block
    // comments, template literals) only lose color on their continuation lines.
    const lines = code.split('\n')
    return lines
      .map((line) => serializeTokens(prism.tokenize(line, grammar)))
      .join('\n')
  } catch {
    return escapeHtml(code)
  }
}