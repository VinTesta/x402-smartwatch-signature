// Testes da Fase 1 executados no relógio. Cada função devolve um relatório (objeto JSON)
// que a página mostra na tela e envia ao app-side -> servidor.
//
// Criptografia: AES-128-CBC, SHA-256 e HMAC em JS puro (shared/); do nativo, só o gerador
// de chaves (aleatoriedade). Mensagens no formato JWE compacto dir + A128CBC-HS256.
import { getDeviceInfo } from '@zos/device'
import { getSystemInfo } from '@zos/settings'
import { fromHex, toHex, toBase64, concat, asciiBytes } from '../shared/bytes.js'
import { KAT, TEST_KEY, PROTOCOL } from '../shared/config.js'
import { sha256, hmacSha256 } from '../shared/sha256.js'
import { expandKey128, encryptBlock, decryptBlock, cbcEncrypt, cbcDecrypt } from '../shared/aes.js'
import { sealJwe, openJwe } from '../shared/jwe.js'
import * as zcrypto from './zcrypto.js'

function errMsg(e) {
  return String((e && e.message) || e)
}

// Executa um passo e guarda o resultado ou o erro, sem derrubar o relatório.
function step(fn) {
  try {
    return fn()
  } catch (e) {
    return { error: errMsg(e) }
  }
}

let rng = null
export function getRng() {
  if (!rng) rng = zcrypto.makeRandom()
  return rng
}

// ---------------------------------------------------------------- Sondagem
export function runProbe() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {}
  return {
    // Sem MAC/UUID/serial: só o que importa para o teste.
    device: step(() => {
      const d = getDeviceInfo()
      return { deviceName: d.deviceName, deviceSource: d.deviceSource, width: d.width, height: d.height, screenShape: d.screenShape }
    }),
    system: step(() => getSystemInfo()),
    js: {
      BigInt: typeof g.BigInt,
      Promise: typeof g.Promise,
      Uint8Array: typeof g.Uint8Array,
      DataView: typeof g.DataView,
      TextEncoder: typeof g.TextEncoder,
      TextDecoder: typeof g.TextDecoder,
      atob: typeof g.atob,
      btoa: typeof g.btoa,
      setTimeout: typeof g.setTimeout,
      Proxy: typeof g.Proxy,
      WeakMap: typeof g.WeakMap,
      Symbol: typeof g.Symbol,
      MathImul: typeof Math.imul,
      eval: typeof g.eval,
    },
    crypto: step(() => zcrypto.cryptoInfo()),
    nativeCrypto: step(() => zcrypto.hasNativeCrypto()),
    rngSource: step(() => getRng().source),
  }
}

// ---------------------------------------------------------------- KAT (JS puro)
function check(got, want) {
  return { ok: got === want, got: got.length > 80 ? got.slice(0, 80) + '…' : got }
}

function time(fn, reps) {
  const t0 = Date.now()
  for (let i = 0; i < reps; i++) fn()
  return Date.now() - t0
}

export function runKat() {
  const v = {}

  v.sha256 = step(() => check(toHex(sha256(asciiBytes(KAT.sha256.msgAscii))), KAT.sha256.digest))
  v.hmac = step(() => check(toHex(hmacSha256(fromHex(KAT.hmac.key), asciiBytes(KAT.hmac.msgAscii))), KAT.hmac.mac))

  v.aesBlock = step(() => {
    const w = expandKey128(fromHex(KAT.aes.key))
    const out = new Uint8Array(16)
    encryptBlock(w, fromHex(KAT.aes.pt), out)
    const back = new Uint8Array(16)
    decryptBlock(w, out, back)
    const r = check(toHex(out), KAT.aes.ecb)
    r.decryptOk = toHex(back) === KAT.aes.pt
    return r
  })

  // SP 800-38A: 4 blocos exatos; nosso CBC aplica PKCS#7, então comparamos os 64 primeiros bytes
  v.cbc = step(() => {
    const ct = cbcEncrypt(fromHex(KAT.cbc.key), fromHex(KAT.cbc.iv), fromHex(KAT.cbc.pt))
    const r = check(toHex(ct.subarray(0, 64)), KAT.cbc.ct)
    r.roundtripOk = toHex(cbcDecrypt(fromHex(KAT.cbc.key), fromHex(KAT.cbc.iv), ct)) === KAT.cbc.pt
    return r
  })

  // JWE completo com chave/IV fixos: tem que sair o MESMO token que o OpenSSL/jose geraram.
  v.jwe = step(() => {
    const tok = sealJwe(fromHex(KAT.jwe.key), KAT.jwe.pt, fromHex(KAT.jwe.iv), KAT.jwe.kid)
    const r = check(tok, KAT.jwe.token)
    r.openOk = openJwe(fromHex(KAT.jwe.key), KAT.jwe.token).plaintext === KAT.jwe.pt
    return r
  })

  // Desempenho no relógio (JS puro no QuickJS)
  const perf = step(() => {
    const kb = new Uint8Array(1024)
    const key16 = new Uint8Array(16)
    const iv = new Uint8Array(16)
    const key32 = new Uint8Array(32)
    return {
      aesCbc1KB_ms: time(() => cbcEncrypt(key16, iv, kb), 5) / 5,
      sha256_1KB_ms: time(() => sha256(kb), 5) / 5,
      hmac_1KB_ms: time(() => hmacSha256(key16, kb), 5) / 5,
      jwe100B_ms: time(() => sealJwe(key32, kb.subarray(0, 100), iv, 'x'), 5) / 5,
    }
  })

  const names = Object.keys(v)
  const passed = names.filter((n) => v[n].ok === true && v[n].decryptOk !== false && v[n].roundtripOk !== false && v[n].openOk !== false)
  return {
    impl: 'js',
    vectors: v,
    perf,
    total: names.length,
    passed: passed.length,
    verdict: passed.length === names.length ? 'TODOS OS VETORES OK' : 'FALHOU: ' + names.filter((n) => passed.indexOf(n) < 0).join(', '),
  }
}

// ---------------------------------------------------------------- RNG
// Coleta chaves cruas do createChiper() para o servidor analisar a qualidade.
export function runRng(count) {
  const n = count || 64
  const keys = []
  const t0 = Date.now()
  let error = null
  try {
    for (let i = 0; i < n; i++) keys.push(zcrypto.aesGenerateKey())
  } catch (e) {
    error = errMsg(e)
  }
  const ms = Date.now() - t0
  const unique = new Set(keys.map(toHex)).size
  return {
    source: 'createChiper(AES_CBC)',
    rngSelected: step(() => getRng().source),
    count: keys.length,
    keyLen: keys.length ? keys[0].length : 0,
    duplicates: keys.length - unique,
    ms,
    error,
    raw: keys.length ? toBase64(concat(...keys)) : '',
  }
}

// ---------------------------------------------------------------- Mensagem real
export function runSeal(message) {
  const r = getRng()
  const t0 = Date.now()
  const iv = r.bytes(16)
  const t1 = Date.now()
  const jwe = sealJwe(fromHex(TEST_KEY), message, iv, PROTOCOL.kid)
  const t2 = Date.now()
  return { jwe, rng: r.source, rng_ms: t1 - t0, seal_ms: t2 - t1 }
}
