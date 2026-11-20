// Utilitários de bytes em JS puro (ES6), sem TextEncoder/btoa/Buffer/BigInt.
// Rodam no relógio (QuickJS do Zepp OS) e no Node (para os testes locais).

export function toU8(data) {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (Array.isArray(data)) return Uint8Array.from(data)
  throw new Error('toU8: tipo não suportado')
}

export function concat(...parts) {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export function equal(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

const HEX = '0123456789abcdef'

export function toHex(bytes) {
  const u8 = toU8(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += HEX[u8[i] >> 4] + HEX[u8[i] & 15]
  return s
}

export function fromHex(hex) {
  const clean = hex.replace(/\s+/g, '')
  if (clean.length % 2 !== 0) throw new Error('fromHex: tamanho ímpar')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    const v = parseInt(clean.substr(i * 2, 2), 16)
    if (Number.isNaN(v)) throw new Error('fromHex: caractere inválido')
    out[i] = v
  }
  return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes) {
  const u8 = toU8(bytes)
  let s = ''
  let i = 0
  for (; i + 2 < u8.length; i += 3) {
    const n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rest = u8.length - i
  if (rest === 1) {
    const n = u8[i] << 16
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '=='
  } else if (rest === 2) {
    const n = (u8[i] << 16) | (u8[i + 1] << 8)
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='
  }
  return s
}

// base64url sem padding (RFC 4648 §5), usado pelo JWE.
export function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  return fromBase64(s + '==='.slice((s.length + 3) % 4))
}

export function fromBase64(str) {
  const clean = str.replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let o = 0
  for (let i = 0; i < clean.length; i++) {
    const v = B64.indexOf(clean[i])
    if (v < 0) throw new Error('fromBase64: caractere inválido')
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buffer >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

// UTF-8 manual (o runtime do relógio pode não ter TextEncoder/TextDecoder).
export function utf8Encode(str) {
  const out = []
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i)
    // par substituto (surrogate pair) -> code point completo
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00)
        i++
      }
    }
    // surrogate solto não é texto válido: vira U+FFFD, como no TextEncoder/Node
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63))
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
  }
  return Uint8Array.from(out)
}

export function utf8Decode(bytes) {
  const b = toU8(bytes)
  let s = ''
  for (let i = 0; i < b.length; ) {
    const c = b[i++]
    let cp
    if (c < 0x80) cp = c
    else if (c < 0xe0) cp = ((c & 0x1f) << 6) | (b[i++] & 63)
    else if (c < 0xf0) cp = ((c & 0x0f) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)
    else cp = ((c & 0x07) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)
    if (cp >= 0x10000) {
      cp -= 0x10000
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
    } else s += String.fromCharCode(cp)
  }
  return s
}

export function asciiBytes(str) {
  const out = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff
  return out
}
