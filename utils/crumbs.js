// "Migalhas" contra crash do firmware.
//
// Algumas chamadas nativas do @zos/crypto com argumentos inesperados derrubam o relógio
// inteiro (reboot), então try/catch não adianta. Antes de cada chamada nativa gravamos o
// nome dela num arquivo. Se o relógio reiniciar, na próxima abertura da página a migalha
// ainda está lá: sabemos exatamente qual chamada causou o crash e a bloqueamos para sempre.
import { readFileSync, writeFileSync } from '@zos/fs'

const CRUMB = 'crypto_crumb.txt'
const BLOCKED = 'crypto_blocked.json'

function readText(path) {
  try {
    const s = readFileSync({ path, options: { encoding: 'utf8' } })
    return typeof s === 'string' ? s : ''
  } catch (e) {
    return ''
  }
}

function writeText(path, text) {
  try {
    writeFileSync({ path, data: text, options: { encoding: 'utf8' } })
    return true
  } catch (e) {
    return false
  }
}

function readJson(path, fallback) {
  const s = readText(path)
  if (!s) return fallback
  try {
    return JSON.parse(s)
  } catch (e) {
    return fallback
  }
}

let blockedList = null
let lastWritten = null
export let lastCrash = null

export function blocked() {
  if (!blockedList) blockedList = readJson(BLOCKED, [])
  return blockedList
}

export function isBlocked(label) {
  return blocked().indexOf(label) >= 0
}

// Um formato (u8/arr/ab) que já derrubou o relógio em qualquer operação não é mais usado.
export function dangerousEncoding(kind, enc) {
  const re = kind === 'key' ? new RegExp('\\.key-' + enc + '(\\.|$)') : new RegExp('\\.(encrypt|decrypt)\\.' + enc + '$')
  return blocked().some((l) => re.test(l))
}

// Grava a migalha ANTES da chamada nativa. Só escreve quando o rótulo muda (laços longos
// com a mesma chamada não geram escrita a cada iteração).
export function crumb(label) {
  if (label === lastWritten) return
  console.log('[crumb] ' + label)
  writeText(CRUMB, label)
  lastWritten = label
}

export function clearCrumb() {
  if (lastWritten === '') return
  writeText(CRUMB, '')
  lastWritten = ''
}

// Chamar ao abrir a página. Se houver migalha, a última chamada derrubou o relógio:
// bloqueia o rótulo e devolve o nome dele (ou null).
export function recoverFromCrash() {
  const last = readText(CRUMB)
  lastWritten = null
  if (!last) {
    lastCrash = null
    return null
  }
  const list = blocked()
  if (list.indexOf(last) < 0) {
    list.push(last)
    writeText(BLOCKED, JSON.stringify(list))
  }
  clearCrumb()
  lastCrash = last
  return last
}

export function resetBlocked() {
  blockedList = []
  writeText(BLOCKED, '[]')
}
