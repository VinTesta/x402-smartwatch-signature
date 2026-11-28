// Side Service (roda dentro do app Zepp no celular).
// Papel: transporte. Busca a cobrança no invoice-server e repassa ao relógio.
// Também entrega ao relógio a chave privada de TESTE salva no Settings App.
import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'
import {
  DEFAULT_SERVER_URL,
  SETTINGS_KEY_URL,
  SETTINGS_KEY_PRIVATE_KEY,
  INVOICE_PATH,
  VALIDATE_PATH,
  METHODS,
} from '../shared/config.js'
import { addressFromPrivateKey } from '../shared/eth-address.js'

function serverUrl() {
  const fromSettings = settingsLib.getItem(SETTINGS_KEY_URL)
  const url = ((fromSettings && String(fromSettings).trim()) || DEFAULT_SERVER_URL).replace(/\/+$/, '')
  // O fetch do iOS rejeita URL sem esquema ("URL incompatível"): assume https.
  if (url && !/^https?:\/\//i.test(url)) return 'https://' + url
  return url
}

function parseBody(body) {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch (e) {
    return body
  }
}

function errorMessage(e) {
  return String((e && e.message) || e)
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

// GET <servidor>/invoice?from=..&to=.. -> { ok, status, ms, invoice } ou { ok: false, error }
// from/to vêm do relógio (endereços); só são repassados se tiverem formato de endereço.
async function fetchInvoice(params) {
  const base = serverUrl()
  if (!base) return { ok: false, error: 'URL do servidor não configurada (Settings App)' }

  const query = []
  for (const name of ['from', 'to']) {
    const value = params && params[name]
    if (value === undefined || value === null || value === '') continue
    if (!ADDRESS_RE.test(String(value))) return { ok: false, error: name + ' inválido: esperado endereço 0x + 40 hex' }
    query.push(name + '=' + encodeURIComponent(String(value)))
  }
  const url = base + INVOICE_PATH + (query.length ? '?' + query.join('&') : '')
  console.log('[side] GET ' + url)
  const t0 = Date.now()
  const res = await fetch({ url, method: 'GET', headers: { Accept: 'application/json' } })
  const ms = Date.now() - t0
  const body = parseBody(res.body)
  console.log('[side] /invoice HTTP ' + res.status + ' em ' + ms + ' ms: ' + JSON.stringify(body))

  if (res.status < 200 || res.status >= 300) {
    return { ok: false, status: res.status, ms, error: 'HTTP ' + res.status }
  }
  if (!body || typeof body !== 'object' || !body.typedData) {
    return { ok: false, status: res.status, ms, error: 'resposta sem typedData' }
  }
  return { ok: true, status: res.status, ms, invoice: body }
}

// POST <servidor>/validate com { publicKey, transaction, signature } vindos do relógio.
// -> { ok, status, ms, result } (result = resposta do servidor) ou { ok: false, error }
// O celular só repassa: quem decide se a assinatura vale é o servidor (viem).
async function validateSignature(params) {
  const base = serverUrl()
  if (!base) return { ok: false, error: 'URL do servidor não configurada (Settings App)' }
  if (!params || !params.publicKey || !params.transaction || !params.signature) {
    return { ok: false, error: 'faltam publicKey, transaction ou signature' }
  }
  const url = base + VALIDATE_PATH
  const payload = JSON.stringify({
    publicKey: params.publicKey,
    transaction: params.transaction,
    signature: params.signature,
  })
  console.log('[side] POST ' + url + ' ' + payload)
  const t0 = Date.now()
  const res = await fetch({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: payload,
  })
  const ms = Date.now() - t0
  const body = parseBody(res.body)
  console.log('[side] /validate HTTP ' + res.status + ' em ' + ms + ' ms: ' + JSON.stringify(body))
  if (!body || typeof body !== 'object') {
    return { ok: false, status: res.status, ms, error: 'resposta inesperada do servidor (HTTP ' + res.status + ')' }
  }
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, status: res.status, ms, error: body.error || 'HTTP ' + res.status }
  }
  return { ok: true, status: res.status, ms, result: body }
}

// Chave privada do Settings App + endereço derivado aqui no celular (o getPublic é caro
// demais no relógio). A chave nunca é logada.
function readKeyAndAddress() {
  const raw = String(settingsLib.getItem(SETTINGS_KEY_PRIVATE_KEY) || '').trim()
  if (!raw) return { ok: false, error: 'chave privada não configurada (Settings App)' }
  const hex = raw.indexOf('0x') === 0 ? raw.slice(2) : raw
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return { ok: false, error: 'chave privada inválida: esperado 32 bytes em hex' }
  }
  const privateKey = '0x' + hex.toLowerCase()
  let address
  try {
    address = addressFromPrivateKey(privateKey)
  } catch (e) {
    return { ok: false, error: 'falha ao derivar o endereço: ' + errorMessage(e) }
  }
  return { ok: true, privateKey, address }
}

// key.get: chave + endereço (o relógio pede só na hora de assinar).
function getPrivateKey() {
  const out = readKeyAndAddress()
  if (out.ok) console.log('[side] key.get: endereço ' + out.address)
  return out
}

// address.get: só o endereço, sem a chave (usado para montar a cobrança).
function getAddress() {
  const out = readKeyAndAddress()
  if (!out.ok) return out
  console.log('[side] address.get: ' + out.address)
  return { ok: true, address: out.address }
}

AppSideService(
  BaseSideService({
    onInit() {
      console.log('[side] init, servidor = ' + (serverUrl() || '(não configurado)'))
    },

    onRequest(req, res) {
      switch (req.method) {
        case METHODS.GET_INVOICE:
          fetchInvoice(req.params)
            .then((out) => res(null, out))
            .catch((e) => {
              console.log('[side] erro no fetch: ' + errorMessage(e))
              res(null, { ok: false, error: 'fetch falhou: ' + errorMessage(e) })
            })
          return

        case METHODS.VALIDATE:
          validateSignature(req.params)
            .then((out) => res(null, out))
            .catch((e) => {
              console.log('[side] erro no POST /validate: ' + errorMessage(e))
              res(null, { ok: false, error: 'fetch falhou: ' + errorMessage(e) })
            })
          return

        case METHODS.GET_ADDRESS:
          res(null, getAddress())
          return

        case METHODS.GET_PRIVATE_KEY:
          res(null, getPrivateKey())
          return

        default:
          res(null, { ok: false, error: 'método desconhecido: ' + req.method })
      }
    },

    onSettingsChange({ key }) {
      // Não loga o valor: pode ser a chave privada.
      console.log('[side] settings alterado: ' + key)
    },

    onRun() {},
    onDestroy() {},
  })
)
