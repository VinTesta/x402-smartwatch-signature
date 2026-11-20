// Uso MÍNIMO do @zos/crypto nativo: só o gerador de chaves, como fonte de aleatoriedade.
//
// O que os testes no Bip 6 (fw 4.6.0.3, API 4.2) mostraram:
//  - createCrypto(...).createChiper() funciona e gera chaves com boa distribuição;
//  - encrypt() de SHA-256, HMAC e AES devolve undefined com Uint8Array e ArrayBuffer;
//  - AES encrypt() com number[] REINICIA o relógio;
//  - getRandomValues só existe a partir do API_LEVEL 5.0.
// Por isso AES/SHA-256/HMAC são feitos em JS puro (shared/aes.js, shared/sha256.js) e
// nenhuma operação de cifra/hash nativa é chamada. Cada chamada nativa restante passa
// por nat() (migalha contra crash, ver utils/crumbs.js).
import * as zc from '@zos/crypto'
import { toU8, concat, asciiBytes } from '../shared/bytes.js'
import { sha256 } from '../shared/sha256.js'
import * as crumbs from './crumbs.js'

function errMsg(e) {
  return String((e && e.message) || e)
}

function safeGet(o, k) {
  try {
    return o[k]
  } catch (e) {
    return undefined
  }
}

function nat(label, fn) {
  if (crumbs.isBlocked(label)) throw new Error('BLOQUEADO (derrubou o relógio antes): ' + label)
  crumbs.crumb(label)
  return fn()
}

// ---------------------------------------------------------------- introspecção (só leitura)

const ALG_NAMES = ['AES_CBC', 'ECDSA', 'MD5', 'HMACMD5', 'SHA_1', 'HMAC_SHA_1', 'SHA_256', 'HMAC_SHA_256']

export function shape(x) {
  if (x === undefined) return 'undefined'
  if (x === null) return 'null'
  if (x instanceof ArrayBuffer) return 'ArrayBuffer(' + x.byteLength + ')'
  if (ArrayBuffer.isView(x)) return 'TypedArray(' + x.byteLength + ')'
  if (typeof x === 'object') {
    try {
      return '{' + Object.getOwnPropertyNames(x).join(',') + '}'
    } catch (e) {
      return 'object'
    }
  }
  return typeof x + ':' + String(x)
}

export function cryptoInfo() {
  const alg = {}
  for (const n of ALG_NAMES) {
    const v = zc.alg ? safeGet(zc.alg, n) : undefined
    if (v !== undefined) alg[n] = v
  }
  let exports = []
  try {
    exports = Object.getOwnPropertyNames(zc)
  } catch (e) {
    // ignora
  }
  return { exports, alg, getRandomValues: typeof zc.getRandomValues }
}

export function hasNativeCrypto() {
  return !!(zc && typeof zc.createCrypto === 'function' && zc.alg && zc.alg.AES_CBC !== undefined)
}

// ---------------------------------------------------------------- gerador de chaves nativo

function keyBytes(k) {
  const v = safeGet(k, 'private_key')
  if (!(v instanceof ArrayBuffer) && !ArrayBuffer.isView(v)) return undefined
  const u8 = toU8(v).slice()
  const len = safeGet(k, 'private_key_length')
  return typeof len === 'number' && len > 0 && len <= u8.length ? u8.slice(0, len) : u8
}

// Pede ao firmware uma chave AES nova (exatamente a chamada que já funcionou no Bip 6).
export function aesGenerateKey() {
  const inst = nat('aes.keygen.create', () => zc.createCrypto(zc.alg.AES_CBC, { key_bit_length: 128, key_encrypt: 0 }))
  if (!inst) throw new Error('createCrypto(AES_CBC) retornou ' + shape(inst))
  const k = nat('aes.keygen.createChiper', () => inst.createChiper())
  const kb = k && keyBytes(k)
  if (!kb || kb.length < 16) throw new Error('createChiper retornou ' + shape(k))
  return kb
}

// ---------------------------------------------------------------- aleatoriedade
// Cada bloco de 16 bytes = SHA-256(chave gerada pelo firmware || contador || horário),
// truncado. O SHA-256 é o nosso (JS), então o "whitening" não depende do nativo.
// Uma chave gerada custa ~300 ms no Bip 6: um IV (16 bytes) = uma chamada.

function u32be(n) {
  return Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

let counter = 0

function harvestFromKeygen(n) {
  const out = new Uint8Array(n)
  for (let off = 0; off < n; off += 16) {
    const block = sha256(concat(aesGenerateKey(), u32be(counter++), asciiBytes(String(Date.now()))))
    out.set(block.subarray(0, Math.min(16, n - off)), off)
  }
  return out
}

export function makeRandom() {
  if (zc && typeof zc.getRandomValues === 'function') {
    try {
      nat('rng.getRandomValues', () => zc.getRandomValues(new Uint8Array(16)))
      return {
        source: 'getRandomValues',
        bytes(n) {
          const b = new Uint8Array(n)
          nat('rng.getRandomValues', () => zc.getRandomValues(b))
          return b
        },
      }
    } catch (e) {
      // segue para o fallback
    }
  }
  let keygenError = null
  try {
    if (aesGenerateKey().length >= 16) return { source: 'aes-keygen+sha256', bytes: harvestFromKeygen }
  } catch (e) {
    keygenError = errMsg(e)
  }
  return {
    source: 'math-random-INSEGURO' + (keygenError ? ' (' + keygenError + ')' : ''),
    bytes(n) {
      const b = new Uint8Array(n)
      for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256)
      return b
    },
  }
}
