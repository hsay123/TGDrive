/**
 * Text/code preview mode detection.
 *
 * The extension is the PRIMARY signal because uploaded code files frequently
 * carry generic MIME types (`application/octet-stream`). MIME is only ever a
 * secondary hint, applied when the extension is unknown.
 *
 * Security invariant: `.html`/`.htm` and every other markup extension resolve
 * to the `code` mode, which renders the file as syntax-highlighted SOURCE
 * TEXT only — never as live, executable HTML.
 */

export type TextPreviewMode =
  | { kind: 'notes'; markdown: boolean }
  | { kind: 'code'; lang: string }

/** Extensions rendered as rendered Markdown ("Notes"). */
export const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  'md',
  'markdown',
  'mdown',
  'mkd',
])

/** Extensions rendered as plain readable text ("Notes", no markdown). */
export const PLAIN_TEXT_EXTENSIONS: ReadonlySet<string> = new Set(['txt', 'text'])

/** Extension → Prism language name for the code editor mode. */
export const CODE_EXTENSION_LANGS: Readonly<Record<string, string>> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  json: 'json',
  jsonc: 'json',
  py: 'python',
  pyw: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  php: 'php',
  rb: 'ruby',
  sql: 'sql',
  xml: 'xml',
  xhtml: 'xml',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  graphql: 'graphql',
  gql: 'graphql',
}

/** MIME → language mapping, used ONLY as a secondary hint. */
const MIME_TO_LANG: Readonly<Record<string, string>> = {
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'javascript',
  'application/javascript': 'javascript',
  'application/json': 'json',
  'application/xml': 'xml',
  'application/yaml': 'yaml',
  'application/x-yaml': 'yaml',
}

/** Max preview content size in bytes (~5 MB). */
export const TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024

export function getExtensionFromName(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return ''
  return name.slice(idx + 1).toLowerCase()
}

/**
 * Resolve which (if any) text preview mode applies to a file entry.
 * Returns null for everything that should use the existing media/Audio/PDF
 * branches or the generic fallback.
 */
export function getTextPreviewMode(
  name: string,
  mime: string | null
): TextPreviewMode | null {
  const ext = getExtensionFromName(name)
  const mimeType = (mime ?? '').toLowerCase()

  if (MARKDOWN_EXTENSIONS.has(ext) || mimeType === 'text/markdown') {
    return { kind: 'notes', markdown: true }
  }

  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    return { kind: 'notes', markdown: false }
  }

  const extLang = CODE_EXTENSION_LANGS[ext]
  if (extLang) {
    return { kind: 'code', lang: extLang }
  }

  // Secondary MIME hint — only when the extension told us nothing.
  const mimeLang = MIME_TO_LANG[mimeType]
  if (mimeLang) {
    return { kind: 'code', lang: mimeLang }
  }

  // Unidentified plain text (e.g. a README with no extension) → plain notes.
  if (mimeType === 'text/plain' && !ext) {
    return { kind: 'notes', markdown: false }
  }

  return null
}