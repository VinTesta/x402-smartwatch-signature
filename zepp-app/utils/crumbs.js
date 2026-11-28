// "Migalhas" da assinatura (adaptado de fase-1/codigo/utils/crumbs.js).
//
// A assinatura pode reiniciar o relógio inteiro (reboot), e aí try/catch e logs não ajudam:
// o que estava em memória se perde. Antes de cada etapa gravamos num arquivo qual etapa vai
// começar e quanto tempo levaram as anteriores. Se o relógio reiniciar, na próxima abertura
// da página o arquivo ainda está lá e mostra em que etapa ele morreu.
//
// Diferente da Fase 1, nada é bloqueado: a ideia é poder repetir o teste.
import { readFileSync, writeFileSync } from '@zos/fs'

const TRACE = 'sign_trace.json'

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

/**
 * Grava a migalha ANTES de começar uma etapa.
 * @param {string} step nome da etapa que vai começar
 * @param {{step: string, ms: number}[]} done etapas já concluídas, com a duração de cada uma
 */
export function beginStep(step, done) {
  console.log('[crumb] ' + step)
  writeText(TRACE, JSON.stringify({ step, startedAt: Date.now(), done }))
}

// Terminou sem reiniciar (com sucesso ou com erro JS): apaga a migalha.
export function clearTrace() {
  writeText(TRACE, '')
}

/**
 * Chamar ao abrir a página. Se houver migalha, a última assinatura derrubou o relógio.
 * Devolve { step, startedAt, done } (e apaga a migalha) ou null.
 */
export function recoverFromCrash() {
  const s = readText(TRACE)
  if (!s) return null
  clearTrace()
  try {
    return JSON.parse(s)
  } catch (e) {
    return { step: s, startedAt: 0, done: [] }
  }
}
