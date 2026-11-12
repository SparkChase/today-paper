export type TokenType = "plain" | "comment" | "string" | "keyword" | "literal" | "number" | "function" | "type" | "tag" | "attr" | "variable" | "punct"

export interface Token {
  type: TokenType
  text: string
}

export type Lang = "tsx" | "ts" | "jsx" | "js" | "css" | "bash" | "json" | "diff" | "text"

const ALIASES: Record<string, Lang> = {
  tsx: "tsx",
  ts: "ts",
  typescript: "ts",
  jsx: "jsx",
  js: "js",
  javascript: "js",
  mjs: "js",
  cjs: "js",
  css: "css",
  scss: "css",
  json: "json",
  jsonc: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  diff: "diff",
  patch: "diff",
  html: "text",
  text: "text",
  txt: "text",
}

export function normaliseLang(lang: string | undefined): Lang {
  return ALIASES[(lang ?? "").toLowerCase()] ?? "text"
}

export function langFromFileName(name: string): Lang {
  const dot = name.lastIndexOf(".")
  return dot < 0 ? "text" : normaliseLang(name.slice(dot + 1))
}

const KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const continue debugger declare default delete do else enum export extends " +
    "finally for from function get if implements import in infer instanceof interface is keyof let namespace new of override " +
    "private protected public readonly return satisfies set static super switch this throw try type typeof var void while with yield"
  ).split(" ")
)
const LITERALS = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"])
const BASH_KEYWORDS = new Set("if then else elif fi for while until do done case esac in function select time export local return exit source alias unset".split(" "))

const WS = /^\s+/
const IDENT = /^[A-Za-z_$][\w$]*/
const NUMBER = /^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?|\.\d[\d_]*)/
const OPERATOR = /^(?:=>|\.\.\.|\?\?=?|\?\.|[=!<>]=?=?|&&=?|\|\|=?|[+\-*/%&|^~?:]=?|<<=?|>>>?=?)/
const PUNCT = /^[()[\];,.@#\\{}]/

function push(out: Token[], type: TokenType, text: string): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === type && (type === "plain" || type === "punct")) last.text += text
  else out.push({ type, text })
}

function stringEnd(src: string, start: number, quote: string): number {
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === "\\") i += 2
    else if (c === quote) return i + 1
    else if (c === "\n" && quote !== "`") return i
    else i++
  }
  return src.length
}

function templateEnd(src: string, start: number): number {
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === "\\") i += 2
    else if (c === "`") return i + 1
    else if (c === "$" && src[i + 1] === "{") {
      let depth = 1
      i += 2
      while (i < src.length && depth) {
        const d = src[i]
        if (d === "{") depth++
        else if (d === "}") depth--
        else if (d === "`") {
          i = templateEnd(src, i)
          continue
        }
        i++
      }
    } else i++
  }
  return src.length
}

type Mode = "js" | "tag" | "children"

function tokenizeJs(src: string, jsx: boolean): Token[] {
  const out: Token[] = []
  const modes: Array<{ mode: Mode; depth: number; closing?: boolean }> = [{ mode: "js", depth: 0 }]
  let i = 0
  let prev = ""
  const startsExpression = () => prev === "" || /[(=,:?{[&|!]$/.test(prev) || prev === "=>" || prev === "return" || prev === "&&" || prev === "||" || prev === "??"
  while (i < src.length) {
    const top = modes[modes.length - 1]
    const rest = src.slice(i, i + 400)
    let m: RegExpExecArray | null
    if (top.mode === "children") {
      const j = src.slice(i).search(/[<{]/)
      const stop = j < 0 ? src.length : i + j
      if (stop > i) {
        push(out, "plain", src.slice(i, stop))
        i = stop
        continue
      }
      if (src[i] === "{") {
        push(out, "punct", "{")
        modes.push({ mode: "js", depth: 1 })
        prev = "{"
        i++
        continue
      }
      const close = /^<\/([A-Za-z_$][\w$.-]*)?\s*>/.exec(rest)
      if (close) {
        push(out, "punct", "</")
        push(out, "tag", close[1] ?? "")
        push(out, "punct", ">")
        modes.pop()
        prev = ">"
        i += close[0].length
        continue
      }
      const open = /^<([A-Za-z_$][\w$.-]*)?/.exec(rest)
      if (open) {
        push(out, "punct", "<")
        push(out, "tag", open[1] ?? "")
        modes.push({ mode: "tag", depth: 0 })
        i += open[0].length
        continue
      }
      push(out, "plain", "<")
      i++
      continue
    }
    if (top.mode === "tag") {
      if ((m = WS.exec(rest))) {
        push(out, "plain", m[0])
        i += m[0].length
      } else if (rest.startsWith("/>")) {
        push(out, "punct", "/>")
        modes.pop()
        prev = ">"
        i += 2
      } else if (rest[0] === ">") {
        push(out, "punct", ">")
        modes.pop()
        modes.push({ mode: "children", depth: 0 })
        i++
      } else if (rest[0] === '"' || rest[0] === "'") {
        const e = stringEnd(src, i, rest[0])
        push(out, "string", src.slice(i, e))
        i = e
      } else if (rest[0] === "{") {
        push(out, "punct", "{")
        modes.push({ mode: "js", depth: 1 })
        prev = "{"
        i++
      } else if ((m = /^[\w$:.-]+/.exec(rest))) {
        push(out, "attr", m[0])
        i += m[0].length
      } else if (rest.startsWith("=")) {
        push(out, "punct", "=")
        i++
      } else {
        push(out, "plain", rest[0])
        i++
      }
      continue
    }
    if ((m = WS.exec(rest))) {
      push(out, "plain", m[0])
      i += m[0].length
      continue
    }
    if (rest.startsWith("//")) {
      const e = src.indexOf("\n", i)
      const end = e < 0 ? src.length : e
      push(out, "comment", src.slice(i, end))
      i = end
      continue
    }
    if (rest.startsWith("/*")) {
      const e = src.indexOf("*/", i + 2)
      const end = e < 0 ? src.length : e + 2
      push(out, "comment", src.slice(i, end))
      i = end
      continue
    }
    const c = rest[0]
    if (c === '"' || c === "'") {
      const e = stringEnd(src, i, c)
      push(out, "string", src.slice(i, e))
      i = e
      prev = c
      continue
    }
    if (c === "`") {
      const e = templateEnd(src, i)
      push(out, "string", src.slice(i, e))
      i = e
      prev = c
      continue
    }
    if (top.depth > 0 || modes.length > 1) {
      if (c === "{") top.depth++
      else if (c === "}") {
        top.depth--
        if (top.depth === 0 && modes.length > 1) {
          push(out, "punct", "}")
          modes.pop()
          prev = "}"
          i++
          continue
        }
      }
    }
    if (jsx && c === "<" && startsExpression()) {
      const open = /^<([A-Za-z_$][\w$.-]*)?(?=[\s/>])/.exec(rest)
      if (open) {
        push(out, "punct", "<")
        push(out, "tag", open[1] ?? "")
        modes.push({ mode: "tag", depth: 0 })
        i += open[0].length
        continue
      }
    }
    if ((m = NUMBER.exec(rest))) {
      push(out, "number", m[0])
      i += m[0].length
      prev = m[0]
      continue
    }
    if ((m = IDENT.exec(rest))) {
      const w = m[0]
      const after = src.slice(i + w.length, i + w.length + 60)
      let type: TokenType = "plain"
      if (LITERALS.has(w)) type = "literal"
      else if (KEYWORDS.has(w) && prev !== ".") type = "keyword"
      else if (/^\s*(?:<[^>()]*>)?\s*\(/.test(after) && !/^[A-Z]/.test(w)) type = "function"
      else if (/^[A-Z][a-z0-9]/.test(w)) type = "type"
      push(out, type, w)
      i += w.length
      prev = w
      continue
    }
    if ((m = OPERATOR.exec(rest))) {
      push(out, "punct", m[0])
      i += m[0].length
      prev = m[0]
      continue
    }
    if ((m = PUNCT.exec(rest))) {
      push(out, "punct", m[0])
      i++
      prev = m[0]
      continue
    }
    push(out, "plain", c)
    i++
  }
  return out
}

function tokenizeCss(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  let depth = 0
  let inValue = false
  let paren = 0
  while (i < src.length) {
    const rest = src.slice(i, i + 300)
    let m: RegExpExecArray | null
    if ((m = WS.exec(rest))) {
      push(out, "plain", m[0])
      i += m[0].length
    } else if (depth === 0 && rest[0] === "(") {
      paren++
      push(out, "punct", "(")
      i++
    } else if (depth === 0 && rest[0] === ")") {
      paren = Math.max(0, paren - 1)
      push(out, "punct", ")")
      i++
    } else if (depth === 0 && paren > 0 && (m = /^[\w-]+(?=\s*:)/.exec(rest))) {
      push(out, "attr", m[0])
      i += m[0].length
    } else if (depth === 0 && paren > 0 && (m = /^-?\d*\.?\d+(?:[a-z%]+)?/.exec(rest))) {
      push(out, "number", m[0])
      i += m[0].length
    } else if (depth === 0 && paren > 0 && (m = /^[\w-]+/.exec(rest))) {
      push(out, "plain", m[0])
      i += m[0].length
    } else if (rest.startsWith("/*")) {
      const e = src.indexOf("*/", i + 2)
      const end = e < 0 ? src.length : e + 2
      push(out, "comment", src.slice(i, end))
      i = end
    } else if (rest[0] === '"' || rest[0] === "'") {
      const e = stringEnd(src, i, rest[0])
      push(out, "string", src.slice(i, e))
      i = e
    } else if (rest[0] === "{") {
      depth++
      inValue = false
      push(out, "punct", "{")
      i++
    } else if (rest[0] === "}") {
      depth = Math.max(0, depth - 1)
      inValue = false
      push(out, "punct", "}")
      i++
    } else if (rest[0] === ";") {
      inValue = false
      push(out, "punct", ";")
      i++
    } else if ((m = /^@[\w-]+/.exec(rest))) {
      push(out, "keyword", m[0])
      i += m[0].length
    } else if (depth > 0 && !inValue && (m = /^(--[\w-]+|-?[a-zA-Z][\w-]*)(?=\s*:)/.exec(rest))) {
      push(out, "attr", m[0])
      i += m[0].length
    } else if (rest[0] === ":" && depth > 0 && !inValue) {
      inValue = true
      push(out, "punct", ":")
      i++
    } else if (inValue && (m = /^!important/.exec(rest))) {
      push(out, "keyword", m[0])
      i += m[0].length
    } else if (inValue && (m = /^#[\da-fA-F]{3,8}\b/.exec(rest))) {
      push(out, "number", m[0])
      i += m[0].length
    } else if (inValue && (m = /^-?\d*\.?\d+(?:[a-z%]+)?/.exec(rest))) {
      push(out, "number", m[0])
      i += m[0].length
    } else if (inValue && (m = /^([\w-]+)(?=\()/.exec(rest))) {
      push(out, "function", m[0])
      i += m[0].length
    } else if (inValue && (m = /^--[\w-]+/.exec(rest))) {
      push(out, "variable", m[0])
      i += m[0].length
    } else if (!inValue && (m = /^(?:[.#][\w-]+|[a-zA-Z][\w-]*|\*|&)/.exec(rest))) {
      push(out, "tag", m[0])
      i += m[0].length
    } else if ((m = /^[\w-]+/.exec(rest))) {
      push(out, "plain", m[0])
      i += m[0].length
    } else {
      push(out, "punct", rest[0])
      i++
    }
  }
  return out
}

function tokenizeJson(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i, i + 200)
    let m: RegExpExecArray | null
    if ((m = WS.exec(rest))) {
      push(out, "plain", m[0])
      i += m[0].length
    } else if (rest.startsWith("//") || rest.startsWith("/*")) {
      const block = rest.startsWith("/*")
      const e = block ? src.indexOf("*/", i + 2) : src.indexOf("\n", i)
      const end = e < 0 ? src.length : block ? e + 2 : e
      push(out, "comment", src.slice(i, end))
      i = end
    } else if (rest[0] === '"') {
      const e = stringEnd(src, i, '"')
      const isKey = /^\s*:/.test(src.slice(e, e + 40))
      push(out, isKey ? "attr" : "string", src.slice(i, e))
      i = e
    } else if ((m = /^-?\d[\d.eE+-]*/.exec(rest))) {
      push(out, "number", m[0])
      i += m[0].length
    } else if ((m = /^(?:true|false|null)\b/.exec(rest))) {
      push(out, "literal", m[0])
      i += m[0].length
    } else {
      push(out, "punct", rest[0])
      i++
    }
  }
  return out
}

function tokenizeBash(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  let command = true
  while (i < src.length) {
    const rest = src.slice(i, i + 300)
    let m: RegExpExecArray | null
    if (rest[0] === "\n") {
      push(out, "plain", "\n")
      command = true
      i++
    } else if ((m = /^[ \t]+/.exec(rest))) {
      push(out, "plain", m[0])
      i += m[0].length
    } else if (rest[0] === "#" && (i === 0 || /\s/.test(src[i - 1]))) {
      const e = src.indexOf("\n", i)
      const end = e < 0 ? src.length : e
      push(out, "comment", src.slice(i, end))
      i = end
    } else if (command && (m = /^[$>] /.exec(rest)) && (i === 0 || src[i - 1] === "\n")) {
      push(out, "punct", m[0])
      i += m[0].length
    } else if (rest[0] === '"' || rest[0] === "'") {
      const e = stringEnd(src, i, rest[0])
      push(out, "string", src.slice(i, e))
      i = e
      command = false
    } else if ((m = /^\$(?:\{[^}]*\}|[A-Za-z_]\w*|[0-9@#?$!*-])/.exec(rest))) {
      push(out, "variable", m[0])
      i += m[0].length
      command = false
    } else if ((m = /^(?:&&|\|\||[|;&]|>>?|<<?|2>&1)/.exec(rest))) {
      push(out, "punct", m[0])
      i += m[0].length
      command = m[0] !== ">" && m[0] !== ">>" && m[0] !== "<" && m[0] !== "<<"
    } else if (!command && (m = /^--?[A-Za-z][\w-]*(?:=[^\s]*)?/.exec(rest))) {
      push(out, "attr", m[0])
      i += m[0].length
    } else if ((m = /^[^\s|;&<>"'$#]+/.exec(rest))) {
      const w = m[0]
      const type: TokenType = command || BASH_KEYWORDS.has(w) ? "keyword" : /^\d+$/.test(w) ? "number" : "plain"
      push(out, type, w)
      i += w.length
      command = false
    } else {
      push(out, "plain", rest[0])
      i++
    }
  }
  return out
}

export function tokenize(code: string, lang: Lang | string): Token[] {
  const l = normaliseLang(lang)
  switch (l) {
    case "tsx":
    case "jsx":
      return tokenizeJs(code, true)
    case "ts":
    case "js":
      return tokenizeJs(code, false)
    case "css":
      return tokenizeCss(code)
    case "json":
      return tokenizeJson(code)
    case "bash":
      return tokenizeBash(code)
    default:
      return code ? [{ type: "plain", text: code }] : []
  }
}

export function tokenizeLines(code: string, lang: Lang | string): Token[][] {
  const lines: Token[][] = [[]]
  for (const t of tokenize(code, lang)) {
    const parts = t.text.split("\n")
    parts.forEach((p, k) => {
      if (k > 0) lines.push([])
      if (p) lines[lines.length - 1].push({ type: t.type, text: p })
    })
  }
  return lines
}

export type DiffKind = "add" | "del" | "ctx" | "meta"

export interface DiffLine {
  kind: DiffKind
  text: string
}

export function parseDiff(code: string): DiffLine[] {
  const out: DiffLine[] = []
  const lines = code.split("\n")
  if (lines.length && lines[lines.length - 1] === "") lines.pop()
  for (const l of lines) {
    if (/^(?:diff --git |index [\da-f]+\.\.|--- (?:a\/|\/dev\/null)|\+\+\+ (?:b\/|\/dev\/null)|@@ |\\ No newline at end of file)/.test(l)) out.push({ kind: "meta", text: l })
    else if (l.startsWith("+")) out.push({ kind: "add", text: l.slice(1) })
    else if (l.startsWith("-")) out.push({ kind: "del", text: l.slice(1) })
    else if (l.startsWith(" ")) out.push({ kind: "ctx", text: l.slice(1) })
    else out.push({ kind: "ctx", text: l })
  }
  return out
}

export function diffResult(lines: readonly DiffLine[]): string {
  return lines
    .filter((l) => l.kind === "add" || l.kind === "ctx")
    .map((l) => l.text)
    .join("\n")
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.kind === "add") added++
    else if (l.kind === "del") removed++
  }
  return { added, removed }
}
