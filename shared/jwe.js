// JWE compacto (RFC 7516) com alg "dir" e enc "A128CBC-HS256" (RFC 7518 §5.2.2), em JS puro.
//
//   K (32 bytes)  = MAC_KEY (16) || ENC_KEY (16)
//   AAD           = ASCII(BASE64URL(cabeçalho protegido))
//   E             = AES-128-CBC(ENC_KEY, IV, PKCS7(P))
//   T             = HMAC-SHA256(MAC_KEY, AAD || IV || E || AL)[0..16]   (AL = bits de AAD, 64 bits BE)
//   token         = cabeçalho . (vazio) . IV . E . T   (cada parte em base64url)
//
// É o formato padrão, então o servidor pode decifrar com qualquer biblioteca JOSE.
import { toU8, concat, equal, utf8Encode, utf8Decode, asciiBytes, toBase64Url, fromBase64Url } from './bytes.js'
import { cbcEncrypt, cbcDecrypt } from './aes.js'
import { hmacSha256 } from './sha256.js'

export const ENC = 'A128CBC-HS256'

function u64be(n) {
  const out = new Uint8Array(8)
  const hi = Math.floor(n / 0x100000000)
  const lo = n >>> 0
  out[0] = hi >>> 24
  out[1] = hi >>> 16
  out[2] = hi >>> 8
  out[3] = hi
  out[4] = lo >>> 24
  out[5] = lo >>> 16
  out[6] = lo >>> 8
  out[7] = lo
  return out
}

function splitKey(key) {
  const k = toU8(key)
  if (k.length !== 32) throw new Error('A128CBC-HS256 exige chave de 32 bytes')
  return { mac: k.subarray(0, 16), enc: k.subarray(16, 32) }
}

function tag(macKey, aad, iv, ct) {
  return hmacSha256(macKey, concat(aad, iv, ct, u64be(aad.length * 8))).subarray(0, 16)
}

// iv: 16 bytes aleatórios (o chamador fornece, para a fonte de aleatoriedade ficar explícita).
export function sealJwe(key, plaintext, iv, kid) {
  const { mac, enc } = splitKey(key)
  const header = { alg: 'dir', enc: ENC }
  if (kid) header.kid = kid
  const protectedB64 = toBase64Url(utf8Encode(JSON.stringify(header)))
  const aad = asciiBytes(protectedB64)
  const pt = typeof plaintext === 'string' ? utf8Encode(plaintext) : toU8(plaintext)
  const ct = cbcEncrypt(enc, iv, pt)
  const t = tag(mac, aad, toU8(iv), ct)
  return protectedB64 + '..' + toBase64Url(iv) + '.' + toBase64Url(ct) + '.' + toBase64Url(t)
}

// Usado no relógio só para o teste de ida e volta; o servidor tem a própria implementação.
export function openJwe(key, token) {
  const parts = String(token).split('.')
  if (parts.length !== 5 || parts[1] !== '') throw new Error('JWE compacto inválido')
  const header = JSON.parse(utf8Decode(fromBase64Url(parts[0])))
  if (header.alg !== 'dir' || header.enc !== ENC) throw new Error('alg/enc não suportado')
  const { mac, enc } = splitKey(key)
  const aad = asciiBytes(parts[0])
  const iv = fromBase64Url(parts[2])
  const ct = fromBase64Url(parts[3])
  if (!equal(tag(mac, aad, iv, ct), fromBase64Url(parts[4]))) throw new Error('tag inválida')
  return { header, plaintext: utf8Decode(cbcDecrypt(enc, iv, ct)) }
}
