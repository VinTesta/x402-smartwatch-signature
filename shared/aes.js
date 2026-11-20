// AES-128 (FIPS 197) e modo CBC com PKCS#7 (SP 800-38A) em JS puro, orientado a bytes.
// Sem BigInt e sem tabelas de 32 bits: simples de auditar. Validado contra o OpenSSL em
// tools/selftest.mjs.
//
// Observação: implementações de AES em software com S-box em tabela não são de tempo
// constante (cache timing). Para o protótipo no relógio isso é aceitável; não use este
// código num servidor compartilhado.
import { toU8 } from './bytes.js'

const SBOX = new Uint8Array(256)
const INV_SBOX = new Uint8Array(256)

function rotl8(x, s) {
  return ((x << s) | (x >>> (8 - s))) & 0xff
}

function xtime(b) {
  return ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff
}

function gmul(a, b) {
  let p = 0
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a
    a = xtime(a)
    b >>>= 1
  }
  return p
}

// Gera a S-box iterando sobre o grupo multiplicativo de GF(2^8) (gerador 3).
;(function initSbox() {
  let p = 1
  let q = 1
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0) // p * 3
    q ^= q << 1 // q / 3
    q ^= q << 2
    q ^= q << 4
    q &= 0xff
    if (q & 0x80) q ^= 0x09
    const x = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4)
    SBOX[p] = x ^ 0x63
  } while (p !== 1)
  SBOX[0] = 0x63
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i
})()

export function expandKey128(key) {
  const k = toU8(key)
  if (k.length !== 16) throw new Error('AES-128: chave deve ter 16 bytes')
  const w = new Uint8Array(176)
  w.set(k)
  let rcon = 1
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4]
    let t1 = w[i - 3]
    let t2 = w[i - 2]
    let t3 = w[i - 1]
    if (i % 16 === 0) {
      const tmp = t0
      t0 = SBOX[t1] ^ rcon
      t1 = SBOX[t2]
      t2 = SBOX[t3]
      t3 = SBOX[tmp]
      rcon = xtime(rcon)
    }
    w[i] = w[i - 16] ^ t0
    w[i + 1] = w[i - 15] ^ t1
    w[i + 2] = w[i - 14] ^ t2
    w[i + 3] = w[i - 13] ^ t3
  }
  return w
}

const S = new Uint8Array(16)
const T = new Uint8Array(16)

function addRoundKey(w, round) {
  const o = round * 16
  for (let i = 0; i < 16; i++) S[i] ^= w[o + i]
}

// Estado em ordem de coluna: S[r + 4c]
function subShift() {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) T[r + 4 * c] = SBOX[S[r + 4 * ((c + r) & 3)]]
  S.set(T)
}

function invShiftSub() {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) T[r + 4 * c] = INV_SBOX[S[r + 4 * ((c - r + 4) & 3)]]
  S.set(T)
}

function mixColumns() {
  for (let c = 0; c < 16; c += 4) {
    const a0 = S[c]
    const a1 = S[c + 1]
    const a2 = S[c + 2]
    const a3 = S[c + 3]
    const all = a0 ^ a1 ^ a2 ^ a3
    S[c] = a0 ^ all ^ xtime(a0 ^ a1)
    S[c + 1] = a1 ^ all ^ xtime(a1 ^ a2)
    S[c + 2] = a2 ^ all ^ xtime(a2 ^ a3)
    S[c + 3] = a3 ^ all ^ xtime(a3 ^ a0)
  }
}

function invMixColumns() {
  for (let c = 0; c < 16; c += 4) {
    const a0 = S[c]
    const a1 = S[c + 1]
    const a2 = S[c + 2]
    const a3 = S[c + 3]
    S[c] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9)
    S[c + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13)
    S[c + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11)
    S[c + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14)
  }
}

// Cifra um bloco: input/out são Uint8Array (16 bytes), w = expandKey128(chave).
export function encryptBlock(w, input, out) {
  S.set(input.subarray(0, 16))
  addRoundKey(w, 0)
  for (let round = 1; round < 10; round++) {
    subShift()
    mixColumns()
    addRoundKey(w, round)
  }
  subShift()
  addRoundKey(w, 10)
  out.set(S)
}

export function decryptBlock(w, input, out) {
  S.set(input.subarray(0, 16))
  addRoundKey(w, 10)
  for (let round = 9; round >= 1; round--) {
    invShiftSub()
    addRoundKey(w, round)
    invMixColumns()
  }
  invShiftSub()
  addRoundKey(w, 0)
  out.set(S)
}

export function pkcs7Pad(data) {
  const padLen = 16 - (data.length % 16) // 1..16
  const out = new Uint8Array(data.length + padLen)
  out.set(data)
  out.fill(padLen, data.length)
  return out
}

export function pkcs7Unpad(data) {
  if (!data.length || data.length % 16) throw new Error('padding inválido')
  const p = data[data.length - 1]
  if (p < 1 || p > 16) throw new Error('padding inválido')
  for (let i = data.length - p; i < data.length; i++) if (data[i] !== p) throw new Error('padding inválido')
  return data.subarray(0, data.length - p)
}

// AES-128-CBC com PKCS#7.
export function cbcEncrypt(key, iv, plaintext) {
  const ivb = toU8(iv)
  if (ivb.length !== 16) throw new Error('IV deve ter 16 bytes')
  const w = expandKey128(key)
  const padded = pkcs7Pad(toU8(plaintext))
  const out = new Uint8Array(padded.length)
  const block = new Uint8Array(16)
  let prev = ivb
  for (let off = 0; off < padded.length; off += 16) {
    for (let i = 0; i < 16; i++) block[i] = padded[off + i] ^ prev[i]
    const dst = out.subarray(off, off + 16)
    encryptBlock(w, block, dst)
    prev = dst
  }
  return out
}

export function cbcDecrypt(key, iv, ciphertext) {
  const ivb = toU8(iv)
  const ct = toU8(ciphertext)
  if (ivb.length !== 16) throw new Error('IV deve ter 16 bytes')
  if (!ct.length || ct.length % 16) throw new Error('ciphertext com tamanho inválido')
  const w = expandKey128(key)
  const out = new Uint8Array(ct.length)
  const block = new Uint8Array(16)
  let prev = ivb
  for (let off = 0; off < ct.length; off += 16) {
    const src = ct.subarray(off, off + 16)
    decryptBlock(w, src, block)
    for (let i = 0; i < 16; i++) out[off + i] = block[i] ^ prev[i]
    prev = src
  }
  return pkcs7Unpad(out)
}
