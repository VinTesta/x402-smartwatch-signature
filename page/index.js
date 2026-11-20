import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { BasePage } from '@zeppos/zml/base-page'
import { TITLE, STATUS, RESULT, buttonStyle } from 'zosLoader:./index.[pf].layout.js'
import { runProbe, runKat, runRng, runSeal } from '../utils/phase1-tests.js'
import * as crumbs from '../utils/crumbs.js'

const logger = Logger.getLogger('phase1')

let msgCounter = 0

Page(
  BasePage({
    state: { status: null, result: null, busy: false, crashed: null },

    onInit() {
      // Se o relógio reiniciou no meio de um teste, a migalha diz qual chamada foi.
      // Ela é bloqueada e nunca mais é executada.
      this.state.crashed = crumbs.recoverFromCrash()
      if (this.state.crashed) logger.log('[crash] o último teste derrubou o relógio em: ' + this.state.crashed)
    },

    build() {
      hmUI.createWidget(hmUI.widget.TEXT, TITLE)

      const tests = [
        ['1 · Sondagem', () => this.run('probe', runProbe)],
        ['2 · KAT (AES/SHA/JWE)', () => this.run('aes.kat', runKat)],
        ['3 · RNG', () => this.run('aes.rng', () => runRng(64))],
        ['4 · Enviar msg', () => this.run('aes.msg', () => runSeal(this.nextMessage()))],
      ]
      tests.forEach(([label, fn], i) => {
        hmUI.createWidget(hmUI.widget.BUTTON, Object.assign(buttonStyle(i, label), { click_func: fn }))
      })

      this.state.status = hmUI.createWidget(hmUI.widget.TEXT, STATUS)
      this.state.result = hmUI.createWidget(hmUI.widget.TEXT, RESULT)

      if (this.state.crashed) {
        this.setStatus('Crash anterior detectado e bloqueado. Role para ver.')
        this.setResult(
          'O último teste reiniciou o relógio na chamada:\n' +
            this.state.crashed +
            '\n\nEla foi bloqueada e não será executada de novo.\n\nBloqueadas: ' +
            crumbs.blocked().join(', ')
        )
      }
    },

    nextMessage() {
      msgCounter += 1
      // Acentos e um caractere de 3 bytes (✓) para exercitar o UTF-8.
      return 'Olá do Bip 6! ação ✓ #' + msgCounter + ' @' + Date.now()
    },

    setStatus(text) {
      this.state.status.setProperty(hmUI.prop.TEXT, text)
    },

    setResult(text) {
      this.state.result.setProperty(hmUI.prop.TEXT, text)
    },

    run(kind, fn) {
      if (this.state.busy) return
      this.state.busy = true
      this.setStatus('Executando ' + kind + '...')

      // Log passo a passo: aparece no `zeus bridge` na hora.
      const stepLog = (name, value) => logger.log('[' + kind + '] ' + name + ' => ' + JSON.stringify(value))

      let payload
      try {
        payload = fn(stepLog)
      } catch (e) {
        payload = { fatal: String((e && e.message) || e) }
      }
      // Terminou sem reiniciar o relógio: apaga a migalha.
      crumbs.clearCrumb()

      // Log completo para o `zeus bridge` (o texto na tela é resumido).
      logger.log('[' + kind + '] ' + JSON.stringify(payload))
      this.setResult(summarize(kind, payload))
      this.setStatus('Enviando ao celular...')

      this.request({ method: 'forward', params: { kind, payload } })
        .then((res) => {
          logger.log('[' + kind + '] resposta: ' + JSON.stringify(res))
          this.setStatus(describeResponse(res))
          this.setResult(summarize(kind, payload) + '\n\n— servidor —\n' + JSON.stringify(res && res.body, null, 1))
        })
        .catch((err) => {
          logger.log('[' + kind + '] erro no envio: ' + JSON.stringify(err))
          this.setStatus('Falha no envio (BLE/app-side): ' + String((err && err.message) || err))
        })
        .then(() => {
          this.state.busy = false
        })
    },
  })
)

function describeResponse(res) {
  if (!res) return 'Sem resposta do app-side'
  if (!res.forwarded) return 'Celular OK, não enviou: ' + res.reason
  return 'Servidor respondeu HTTP ' + res.status + ' em ' + res.ms + ' ms'
}

function summarize(kind, p) {
  try {
    return summarizeUnsafe(kind, p)
  } catch (e) {
    return JSON.stringify(p)
  }
}

const cut = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s)
const res = (x) => (x && x.error ? 'ERRO ' + cut(x.error, 160) : JSON.stringify(x))

function summarizeUnsafe(kind, p) {
  if (p && p.fatal) return 'ERRO: ' + p.fatal
  if (kind === 'probe') {
    return [
      'BigInt: ' + p.js.BigInt + ' | Promise: ' + p.js.Promise,
      'TextEncoder: ' + p.js.TextEncoder + ' | btoa: ' + p.js.btoa,
      'API: ' + (p.system && p.system.minAPI) + ' | OS: ' + (p.system && p.system.osVersion),
      'crypto nativo: ' + p.nativeCrypto,
      'exports: ' + (p.crypto && p.crypto.exports ? p.crypto.exports.join(', ') : JSON.stringify(p.crypto)),
      'alg: ' + (p.crypto && p.crypto.alg ? Object.keys(p.crypto.alg).join(', ') : '-'),
      'getRandomValues: ' + (p.crypto && p.crypto.getRandomValues),
      'RNG escolhido: ' + JSON.stringify(p.rngSource),
    ].join('\n')
  }
  if (kind === 'aes.kat') {
    const lines = [p.verdict + ' (' + p.passed + '/' + p.total + ')', '']
    for (const name of Object.keys(p.vectors)) {
      const r = p.vectors[name]
      lines.push(name + ': ' + (r.error ? res(r) : r.ok ? 'OK' : 'DIFERENTE ' + r.got))
    }
    lines.push('', 'tempo (ms): ' + (p.perf.error ? res(p.perf) : JSON.stringify(p.perf)))
    return lines.join('\n')
  }
  if (kind === 'aes.rng') {
    return [
      'chaves: ' + p.count + ' x ' + p.keyLen + 'B em ' + p.ms + ' ms',
      'duplicadas: ' + p.duplicates,
      'RNG escolhido: ' + JSON.stringify(p.rngSelected),
      p.error ? 'erro: ' + p.error : '',
    ].join('\n')
  }
  if (kind === 'aes.msg') {
    return [
      'JWE dir + A128CBC-HS256 (' + p.jwe.length + ' chars)',
      cut(p.jwe, 120),
      'rng: ' + p.rng + ' (' + p.rng_ms + ' ms) | cifrar: ' + p.seal_ms + ' ms',
    ].join('\n')
  }
  return JSON.stringify(p)
}
