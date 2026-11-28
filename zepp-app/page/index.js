import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import {
  setPageBrightTime,
  resetPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from '@zos/display'
import { BasePage } from '@zeppos/zml/base-page'
import { TITLE, STATUS, BODY, buttonStyle } from 'zosLoader:./index.[pf].layout.js'
// Submódulos do elliptic importados direto: a raiz (elliptic.js) faz require('../package.json'),
// que o Rollup do Zeus não consegue empacotar (sem @rollup/plugin-json).
import EC from 'elliptic/lib/elliptic/ec/index.js'
import ecUtils from 'elliptic/lib/elliptic/utils.js'
import { keccak256 } from 'js-sha3'
import BN from 'bn.js'
import { METHODS, EIP712_DOMAIN, TEST_PAY_TO } from '../shared/config.js'
import * as crumbs from '../utils/crumbs.js'

const logger = Logger.getLogger('invoice')

// Pausa entre as etapas da assinatura: devolve o controle ao sistema (repinta a tela, atende
// o watchdog) antes da próxima etapa pesada. Não fatia uma etapa por dentro (isso exigiria
// mexer no elliptic), só separa uma etapa da outra.
const YIELD_MS = 50

// Montar a curva (~14 s) e assinar (~22 s) bloqueiam o app no Bip 6. Sem manter a tela acesa ela
// apaga pelo tempo normal e o app, ocupado, não consegue reacendê-la: parece travado/morto.
// Duração finita: se o reset falhar, a tela volta ao normal sozinha depois desse tempo.
const SCREEN_ON_MS = 120000

// Curva secp256k1 montada UMA vez por sessão do app (cálculo único), logo depois de buscar a
// cobrança, e reaproveitada em todas as assinaturas. Só contém dados públicos (parâmetros da
// curva e tabelas de múltiplos de G): reaproveitar não reduz a segurança. Chave e nonce k
// nunca são guardados aqui.
let curve = null
let curveMs = null // tempo que levou para montar (para os relatórios)

Page(
  BasePage({
    state: {
      invoice: null, // última cobrança recebida do servidor (JSON de /invoice)
      busy: false,
      statusWidget: null,
      bodyWidget: null,
      crashed: null, // migalha da assinatura que derrubou o relógio, se houver
    },

    onInit() {
      // Se o relógio reiniciou no meio da assinatura, a migalha diz em qual etapa.
      this.state.crashed = crumbs.recoverFromCrash()
      if (this.state.crashed) logger.log('[crash] assinatura anterior reiniciou o relógio: ' + JSON.stringify(this.state.crashed))
    },

    build() {
      hmUI.createWidget(hmUI.widget.TEXT, TITLE)

      hmUI.createWidget(
        hmUI.widget.BUTTON,
        Object.assign(buttonStyle(0, 'Buscar cobrança'), { click_func: () => this.fetchInvoice() })
      )
      hmUI.createWidget(
        hmUI.widget.BUTTON,
        Object.assign(buttonStyle(1, 'Assinar e enviar', 'sign'), { click_func: () => this.onSignAndSend() })
      )

      this.state.statusWidget = hmUI.createWidget(hmUI.widget.TEXT, STATUS)
      this.state.bodyWidget = hmUI.createWidget(hmUI.widget.TEXT, BODY)

      const c = this.state.crashed
      if (c) {
        this.setStatus('Reinício na etapa: ' + c.step)
        this.state.bodyWidget.setProperty(
          hmUI.prop.TEXT,
          [
            '— a última assinatura reiniciou o relógio —',
            'Etapa em andamento: ' + c.step,
            'Começou em: ' + (c.startedAt ? new Date(c.startedAt).toISOString() : '?'),
            '',
            'Etapas concluídas antes (ms):',
          ]
            .concat((c.done || []).map((d) => '  ' + d.step + ': ' + d.ms))
            .join('\n')
        )
      }
    },

    setStatus(text) {
      this.state.statusWidget.setProperty(hmUI.prop.TEXT, text)
    },

    // Mostra o corpo da transação que será assinada.
    showBody(invoice) {
      let text
      try {
        text = formatInvoice(invoice)
      } catch (e) {
        text = 'Corpo em formato inesperado:\n' + JSON.stringify(invoice, null, 1)
      }
      this.state.bodyWidget.setProperty(hmUI.prop.TEXT, text)
    },

    // Botão "Buscar cobrança":
    //   1) address.get: endereço da carteira (derivado da chave no celular; a chave não vem)
    //   2) invoice.get com { from: esse endereço, to: TEST_PAY_TO } → GET <servidor>/invoice?from=..&to=..
    //   3) mostra o corpo e já monta a curva (cálculo único na sessão), enquanto você lê a cobrança
    fetchInvoice() {
      if (this.state.busy) return
      this.state.busy = true
      this.setStatus('Buscando endereço da carteira...')
      const t0 = Date.now()

      this.request({ method: METHODS.GET_ADDRESS })
        .then((res) => {
          if (!res || !res.ok) throw new Error((res && res.error) || 'sem resposta do celular')
          if (!/^0x[0-9a-f]{40}$/.test(String(res.address))) throw new Error('o celular não enviou um endereço válido')
          this.setStatus('Buscando cobrança...')
          return this.request({ method: METHODS.GET_INVOICE, params: { from: res.address, to: TEST_PAY_TO } })
        })
        .then((res) => {
          logger.log('[invoice] resposta: ' + JSON.stringify(res))
          if (!res || !res.ok) throw new Error((res && res.error) || 'sem resposta do celular')
          this.state.invoice = res.invoice
          this.showBody(res.invoice)
          const fetchMs = Date.now() - t0
          if (curve) {
            this.setStatus('Cobrança recebida em ' + fetchMs + ' ms. Curva já pronta.')
            return
          }
          // Cálculo único da curva (~14 s no Bip 6). Bloqueia o app: tela acesa e migalha.
          this.setStatus('Cobrança recebida em ' + fetchMs + ' ms. Preparando a curva (~15 s), não toque no relógio...')
          return new Promise((resolve) => setTimeout(resolve, YIELD_MS)).then(() => {
            this.keepScreenOn()
            crumbs.beginStep('0 new EC (após buscar cobrança)', [])
            const t = Date.now()
            curve = new EC('secp256k1')
            curveMs = Date.now() - t
            this.releaseScreen()
            crumbs.clearTrace()
            logger.log('[curve] montada em ' + curveMs + ' ms')
            this.setStatus('Cobrança recebida em ' + fetchMs + ' ms. Curva pronta em ' + curveMs + ' ms.')
          })
        })
        .catch((err) => {
          logger.log('[invoice] erro: ' + String((err && err.message) || err))
          this.setStatus('Falha: ' + String((err && err.message) || err))
        })
        .then(() => {
          this.state.busy = false
        })
    },

    // Pede ao Side Service a chave privada salva no Settings App e o endereço derivado dela
    // NO CELULAR (o getPublic no relógio levou ~20 s e às vezes reiniciou o aparelho).
    // FASE DE TESTE: na versão final a chave nasce no relógio e o celular não a conhece.
    // @returns {Promise<{privateKey: string, address: string}>} ambos em hex com "0x"
    requestPrivateKey() {
      return this.request({ method: METHODS.GET_PRIVATE_KEY }).then((res) => {
        if (!res || !res.ok) throw new Error((res && res.error) || 'sem resposta do celular')
        if (!/^0x[0-9a-f]{40}$/.test(String(res.address))) {
          throw new Error('o celular não enviou um endereço válido')
        }
        return { privateKey: res.privateKey, address: res.address }
      })
    },

    // Mantém a tela acesa enquanto o app fica bloqueado em cálculo. Chamadas nativas novas:
    // migalha antes de cada uma (se reiniciar o relógio, a próxima abertura mostra qual foi)
    // e try/catch. Duração finita como segurança.
    keepScreenOn() {
      crumbs.beginStep('display.setPageBrightTime', [])
      try {
        logger.log('[display] setPageBrightTime => ' + setPageBrightTime({ brightTime: SCREEN_ON_MS }))
      } catch (e) {
        logger.log('[display] setPageBrightTime erro: ' + String((e && e.message) || e))
      }
      crumbs.beginStep('display.pauseDropWristScreenOff', [])
      try {
        logger.log('[display] pauseDropWristScreenOff => ' + pauseDropWristScreenOff({ duration: SCREEN_ON_MS }))
      } catch (e) {
        logger.log('[display] pauseDropWristScreenOff erro: ' + String((e && e.message) || e))
      }
    },

    // Volta o comportamento normal da tela.
    releaseScreen() {
      crumbs.beginStep('display.resetPageBrightTime', [])
      try {
        resetPageBrightTime()
      } catch (e) {
        logger.log('[display] resetPageBrightTime erro: ' + String((e && e.message) || e))
      }
      crumbs.beginStep('display.resetDropWristScreenOff', [])
      try {
        resetDropWristScreenOff()
      } catch (e) {
        logger.log('[display] resetDropWristScreenOff erro: ' + String((e && e.message) || e))
      }
    },

    // Botão "Assinar e enviar": guarda de estado em volta de signAndSend().
    onSignAndSend() {
      if (this.state.busy) return
      if (!this.state.invoice) {
        this.setStatus('Busque uma cobrança primeiro.')
        return
      }
      this.state.busy = true
      this.setStatus('Assinando...')
      this.keepScreenOn()

      Promise.resolve()
        .then(() => this.signAndSend(this.state.invoice))
        .then((result) => {
          logger.log('[sign] resultado: ' + JSON.stringify(result))
          const val = result && result.validation
          this.setStatus(
            'Assinado em ' + (result ? result.signMs : '?') + ' ms · servidor: ' +
              (!val ? '?' : !val.ok ? 'não validou (' + val.error + ')' : val.valid ? 'VÁLIDA ✓' : 'INVÁLIDA ✗')
          )
        })
        .catch((err) => {
          logger.log('[sign] erro: ' + String((err && err.message) || err))
          this.setStatus('Falha: ' + String((err && err.message) || err))
        })
        .then(() => {
          this.releaseScreen()
          // Chegou aqui sem reiniciar (sucesso ou erro JS): a migalha não é mais necessária.
          crumbs.clearTrace()
          this.state.busy = false
        })
    },

    /**
     * Assina o corpo da cobrança em EIP-712 (TransferWithAuthorization, EIP-3009)
     * com ECDSA secp256k1 (RFC 6979, s baixo) e envia ao servidor (POST /validate) para validação.
     *
     * Cada etapa grava uma migalha antes de começar (se o relógio reiniciar, a próxima abertura
     * mostra onde parou), atualiza o status e faz uma pausa curta para devolver o controle ao
     * sistema antes do cálculo pesado.
     *
     * @param {object} invoice JSON recebido de /invoice ({ typedData: { domain, types, primaryType, message }, ... })
     * @returns {Promise<object>} assinatura (r, s, v, 65 bytes), digest, endereço, tempo de cada etapa e veredito do servidor
     */
    async signAndSend(invoice) {
      const done = [] // etapas concluídas: { step, ms }
      const tStart = Date.now()
      let t

      // ---- etapa 1: chave (BLE até o celular) ---------------------------------------------
      crumbs.beginStep('1 chave', done)
      this.setStatus('1/5 Pedindo a chave...')
      t = Date.now()
      // O endereço vem do celular, que não é confiável. Se ele mentir, a assinatura continua
      // sendo da chave do relógio e o contrato recusa o from errado: no máximo nega serviço.
      const { privateKey, address } = await this.requestPrivateKey()
      done.push({ step: '1 chave', ms: Date.now() - t })

      const message = invoice.typedData.message
      const remoteDomain = invoice.typedData.domain || {}

      // O domínio vem do app, não do celular. Se o recebido for diferente, recusa.
      if (
        String(remoteDomain.name) !== EIP712_DOMAIN.name ||
        String(remoteDomain.version) !== EIP712_DOMAIN.version ||
        String(remoteDomain.chainId) !== EIP712_DOMAIN.chainId ||
        String(remoteDomain.verifyingContract).toLowerCase() !== EIP712_DOMAIN.verifyingContract.toLowerCase()
      ) {
        throw new Error('domínio EIP-712 recebido difere do domínio fixo do app')
      }
      if (invoice.typedData.primaryType !== 'TransferWithAuthorization') {
        throw new Error('primaryType inesperado: ' + invoice.typedData.primaryType)
      }
      const nonceHex = String(message.nonce).replace(/^0x/, '').toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(nonceHex)) throw new Error('nonce inválido (esperado bytes32)')

      // ---- etapa 2: hash EIP-712 (keccak + bn.js) -----------------------------------------
      crumbs.beginStep('2 hash EIP-712', done)
      this.setStatus('2/5 Hash EIP-712...')
      await new Promise((resolve) => setTimeout(resolve, YIELD_MS))
      t = Date.now()
      // domainSeparator = keccak256(abi.encode(typeHash, keccak(name), keccak(version), chainId, verifyingContract))
      // Cada campo ABI ocupa 32 bytes (64 hex). uint256 vem de string decimal via bn.js (sem BigInt).
      const domainSeparator = keccak256(
        ecUtils.toArray(
          keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)') +
            keccak256(EIP712_DOMAIN.name) +
            keccak256(EIP712_DOMAIN.version) +
            new BN(EIP712_DOMAIN.chainId, 10).toString(16, 64) +
            EIP712_DOMAIN.verifyingContract.slice(2).toLowerCase().padStart(64, '0'),
          'hex'
        )
      )
      // hashStruct(message) = keccak256(abi.encode(typeHash, from, to, value, validAfter, validBefore, nonce))
      const structHash = keccak256(
        ecUtils.toArray(
          keccak256(
            'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)'
          ) +
            String(message.from).slice(2).toLowerCase().padStart(64, '0') +
            String(message.to).slice(2).toLowerCase().padStart(64, '0') +
            new BN(String(message.value), 10).toString(16, 64) +
            new BN(String(message.validAfter), 10).toString(16, 64) +
            new BN(String(message.validBefore), 10).toString(16, 64) +
            nonceHex,
          'hex'
        )
      )
      // digest = keccak256(0x1901 || domainSeparator || hashStruct)
      const digest = keccak256(ecUtils.toArray('1901' + domainSeparator + structHash, 'hex'))
      done.push({ step: '2 hash EIP-712', ms: Date.now() - t })

      // ---- etapa 3: curva secp256k1 (cálculo único na sessão) -----------------------------
      // Normalmente já foi montada depois de "Buscar cobrança"; só monta aqui se ainda não houver.
      if (curve) {
        done.push({ step: '3 curva (já pronta, montada em ' + curveMs + ' ms)', ms: 0 })
      } else {
        crumbs.beginStep('3 new EC', done)
        this.setStatus('3/5 Preparando a curva...')
        await new Promise((resolve) => setTimeout(resolve, YIELD_MS))
        t = Date.now()
        curve = new EC('secp256k1')
        curveMs = Date.now() - t
        done.push({ step: '3 new EC', ms: curveMs })
      }
      const ec = curve

      // ---- etapa 4: assinatura ECDSA (RFC 6979, s baixo, v = 27 + recoveryParam) ------------
      crumbs.beginStep('4 sign', done)
      this.setStatus('4/5 Assinando...')
      await new Promise((resolve) => setTimeout(resolve, YIELD_MS))
      t = Date.now()
      const key = ec.keyFromPrivate(privateKey.slice(2), 'hex')
      const sig = key.sign(digest, { canonical: true })
      const r = sig.r.toString(16, 64)
      const s = sig.s.toString(16, 64)
      const v = 27 + sig.recoveryParam
      const signature = '0x' + r + s + v.toString(16)
      done.push({ step: '4 sign', ms: Date.now() - t })
      logger.log('[sign] assinatura: ' + signature + ' tempos: ' + JSON.stringify(done))

      // Sem etapa 5: o endereço (getPublic) foi calculado no celular. Se não bater com
      // message.from, o contrato do USDC recusa a autorização.
      const fromMatches = address === String(message.from).toLowerCase()

      const result = {
        signature,
        r: '0x' + r,
        s: '0x' + s,
        v,
        digest: '0x' + digest,
        domainSeparator: '0x' + domainSeparator,
        structHash: '0x' + structHash,
        address,
        fromMatches,
        steps: done,
        signMs: Date.now() - tStart, // até a assinatura pronta (sem o envio)
        validation: null, // preenchido na etapa 5
        totalMs: null,
      }
      logger.log('[sign] ' + JSON.stringify(result))

      // Mostra a assinatura já, antes do envio (se o envio falhar, ela continua na tela).
      const signatureLines = [
        '— assinatura EIP-712 —',
        'v: ' + v,
        'r: ' + result.r,
        's: ' + result.s,
        'digest: ' + result.digest,
        'endereço (do celular): ' + address + (fromMatches ? ' (= from)' : ' (≠ from!)'),
      ]
      this.state.bodyWidget.setProperty(
        hmUI.prop.TEXT,
        signatureLines.concat(['', 'Enviando ao servidor...', '', formatInvoice(invoice)]).join('\n')
      )

      // ---- etapa 5: envio ao servidor (Side Service → POST /validate) ----------------------
      // O servidor valida com viem, de forma independente deste código. Envia o domínio que o
      // relógio USOU (o fixo do app), não o que veio do celular.
      crumbs.beginStep('5 envio /validate', done)
      this.setStatus('5/5 Enviando ao servidor...')
      t = Date.now()
      try {
        const res = await this.request({
          method: METHODS.VALIDATE,
          params: {
            publicKey: address,
            transaction: {
              domain: EIP712_DOMAIN,
              primaryType: 'TransferWithAuthorization',
              message,
            },
            signature,
          },
        })
        if (!res || !res.ok) throw new Error((res && res.error) || 'sem resposta do celular')
        result.validation = {
          ok: true,
          valid: !!res.result.valid,
          checks: res.result.checks,
          timeWindowOk: res.result.timeWindow ? res.result.timeWindow.ok : null,
          serverDigest: res.result.digest,
          digestMatches: res.result.digest === result.digest,
          signer: res.result.recovered ? res.result.recovered.address : null,
          httpMs: res.ms, // celular ↔ servidor
        }
      } catch (e) {
        result.validation = { ok: false, error: String((e && e.message) || e) }
      }
      done.push({ step: '5 envio /validate', ms: Date.now() - t })
      result.totalMs = Date.now() - tStart
      logger.log('[validate] ' + JSON.stringify(result.validation))

      const val = result.validation
      const validationLines = ['— validação no servidor —']
      if (!val.ok) {
        validationLines.push('NÃO VALIDADA: ' + val.error)
      } else {
        validationLines.push(val.valid ? 'VÁLIDA ✓' : 'INVÁLIDA ✗')
        for (const name of Object.keys(val.checks || {})) {
          validationLines.push('  ' + (val.checks[name] ? '✓ ' : '✗ ') + name)
        }
        validationLines.push('  ' + (val.timeWindowOk ? '✓ ' : '✗ ') + 'dentro da validade (informativo)')
        validationLines.push('  digest do servidor ' + (val.digestMatches ? '= relógio' : '≠ relógio!'))
        validationLines.push('  HTTP celular↔servidor: ' + val.httpMs + ' ms')
      }

      this.state.bodyWidget.setProperty(
        hmUI.prop.TEXT,
        validationLines
          .concat([''], signatureLines, ['', 'tempo por etapa (ms):'])
          .concat(done.map((d) => '  ' + d.step + ': ' + d.ms))
          .concat(['  assinatura: ' + result.signMs, '  total: ' + result.totalMs, '', formatInvoice(invoice)])
          .join('\n')
      )

      return result
    },
  })
)

// ---------------------------------------------------------------------------
// Formatação do corpo para a tela (sem BigInt: valores são strings decimais)
// ---------------------------------------------------------------------------

function formatInvoice(invoice) {
  const td = invoice.typedData
  const m = td.message
  const d = td.domain
  const decimals = (invoice.display && invoice.display.decimals) || 6
  const symbol = (invoice.display && invoice.display.symbol) || d.name

  return [
    invoice.description ? invoice.description : '',
    'Valor: ' + formatUnits(m.value, decimals) + ' ' + symbol,
    'Para: ' + m.to,
    'De: ' + m.from,
    'Válido de: ' + formatTimestamp(m.validAfter),
    'Válido até: ' + formatTimestamp(m.validBefore),
    'Nonce: ' + m.nonce,
    '',
    '— domínio EIP-712 —',
    d.name + ' v' + d.version + ' · chainId ' + d.chainId,
    'Contrato: ' + d.verifyingContract,
    '',
    '— ' + td.primaryType + ' (JSON) —',
    JSON.stringify(m, null, 1),
  ].join('\n')
}

// "10000" com 6 casas -> "0.01" (manipulação de string, sem BigInt).
function formatUnits(value, decimals) {
  let s = String(value).replace(/^0+/, '') || '0'
  while (s.length <= decimals) s = '0' + s
  const int = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals).replace(/0+$/, '')
  return frac ? int + '.' + frac : int
}

function formatTimestamp(seconds) {
  const n = Number(seconds)
  if (!n) return String(seconds)
  const date = new Date(n * 1000)
  const pad = (x) => (x < 10 ? '0' : '') + x
  return (
    date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) +
    ' (' + seconds + ')'
  )
}
