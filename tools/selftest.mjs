// Autoteste local (Node): confere o código do relógio (shared/) contra implementações
// independentes — OpenSSL (via node:crypto) e a biblioteca `jose` — e a referência do
// servidor (tools/aes-reference.cjs).
//   npm run selftest
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import * as jose from 'jose'
import { toHex, fromHex, toBase64, toBase64Url, fromBase64Url, fromBase64, utf8Encode, utf8Decode } from '../shared/bytes.js'
import { sha256, hmacSha256 } from '../shared/sha256.js'
import { expandKey128, encryptBlock, decryptBlock, cbcEncrypt, cbcDecrypt, pkcs7Unpad } from '../shared/aes.js'
import { sealJwe, openJwe } from '../shared/jwe.js'
import { KAT, TEST_KEY } from '../shared/config.js'

const require = createRequire(import.meta.url)
const ref = require('./aes-reference.cjs')

let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log('  ok  ' + name)
  } catch (e) {
    console.error('  FALHOU  ' + name + '\n' + e.stack)
    process.exitCode = 1
  }
}
const rnd = (n) => new Uint8Array(crypto.randomBytes(n))
const nodeEcb = (k, b) => {
  const c = crypto.createCipheriv('aes-128-ecb', k, null)
  c.setAutoPadding(false)
  return Buffer.concat([c.update(b), c.final()]).toString('hex')
}

console.log('bytes.js')
await test('UTF-8 ida e volta == Buffer (acentos, emoji, surrogates)', () => {
  for (const s of ['', 'abc', 'Olá ação ✓', '😀 x 🔐', 'ç'.repeat(40), '\u0000\u007f\u0080߿ࠀ￿', 'a\ud83db', 'x\udc00']) {
    assert.equal(toHex(utf8Encode(s)), Buffer.from(s, 'utf8').toString('hex'), s)
    assert.equal(utf8Decode(Buffer.from(s, 'utf8')), Buffer.from(s, 'utf8').toString('utf8'))
  }
})
await test('base64 / base64url == Buffer para tamanhos 0..80', () => {
  for (let n = 0; n <= 80; n++) {
    const b = crypto.randomBytes(n)
    assert.equal(toBase64(b), b.toString('base64'))
    assert.equal(toBase64Url(b), b.toString('base64url'))
    assert.equal(toHex(fromBase64Url(b.toString('base64url'))), b.toString('hex'))
    assert.equal(toHex(fromBase64(b.toString('base64'))), b.toString('hex'))
  }
})

console.log('sha256.js (contra OpenSSL)')
await test('SHA-256: 0..300 bytes aleatórios + 100 KB', () => {
  for (let n = 0; n <= 300; n++) {
    const d = crypto.randomBytes(n)
    assert.equal(toHex(sha256(d)), crypto.createHash('sha256').update(d).digest('hex'), 'len ' + n)
  }
  const big = crypto.randomBytes(100 * 1024)
  assert.equal(toHex(sha256(big)), crypto.createHash('sha256').update(big).digest('hex'))
})
await test('HMAC-SHA256: chaves de 0..150 bytes (inclui > 64, que é hasheada)', () => {
  for (let n = 0; n <= 150; n += 1) {
    const k = crypto.randomBytes(n)
    const d = crypto.randomBytes((n * 7) % 200)
    assert.equal(toHex(hmacSha256(k, d)), crypto.createHmac('sha256', k).update(d).digest('hex'), 'key ' + n)
  }
})

console.log('aes.js (contra OpenSSL)')
await test('AES-128 bloco: 500 chaves/blocos aleatórios, cifrar e decifrar', () => {
  const out = new Uint8Array(16)
  const back = new Uint8Array(16)
  for (let i = 0; i < 500; i++) {
    const k = crypto.randomBytes(16)
    const b = crypto.randomBytes(16)
    const w = expandKey128(k)
    encryptBlock(w, b, out)
    assert.equal(toHex(out), nodeEcb(k, b))
    decryptBlock(w, out, back)
    assert.equal(toHex(back), b.toString('hex'))
  }
})
await test('AES-128-CBC + PKCS#7: 0..200 bytes, IV aleatório, nos dois sentidos', () => {
  for (let n = 0; n <= 200; n++) {
    const k = crypto.randomBytes(16)
    const iv = crypto.randomBytes(16)
    const p = crypto.randomBytes(n)
    const c = crypto.createCipheriv('aes-128-cbc', k, iv)
    const refCt = Buffer.concat([c.update(p), c.final()])
    assert.equal(toHex(cbcEncrypt(k, iv, p)), refCt.toString('hex'), 'enc ' + n)
    assert.equal(toHex(cbcDecrypt(k, iv, refCt)), p.toString('hex'), 'dec ' + n)
  }
})
await test('padding inválido é rejeitado', () => {
  assert.throws(() => pkcs7Unpad(new Uint8Array(16)), /padding inválido/)
  const bad = new Uint8Array(16).fill(3)
  bad[15] = 4
  assert.throws(() => pkcs7Unpad(bad), /padding inválido/)
  assert.throws(() => cbcDecrypt(rnd(16), rnd(16), rnd(15)), /tamanho inválido/)
})

console.log('vetores KAT de shared/config.js (conferidos por fontes independentes)')
await test('FIPS-197, SP 800-38A, FIPS 180-2 e RFC 4231 batem com o OpenSSL', () => {
  assert.equal(nodeEcb(fromHex(KAT.aes.key), fromHex(KAT.aes.pt)), KAT.aes.ecb)
  const c = crypto.createCipheriv('aes-128-cbc', fromHex(KAT.cbc.key), fromHex(KAT.cbc.iv))
  c.setAutoPadding(false)
  assert.equal(Buffer.concat([c.update(fromHex(KAT.cbc.pt)), c.final()]).toString('hex'), KAT.cbc.ct)
  assert.equal(crypto.createHash('sha256').update(KAT.sha256.msgAscii).digest('hex'), KAT.sha256.digest)
  assert.equal(crypto.createHmac('sha256', fromHex(KAT.hmac.key)).update(KAT.hmac.msgAscii).digest('hex'), KAT.hmac.mac)
})
await test('token JWE do KAT é aceito pelo jose e reproduzido pelo nosso código', async () => {
  const d = await jose.compactDecrypt(KAT.jwe.token, fromHex(KAT.jwe.key))
  assert.equal(new TextDecoder().decode(d.plaintext), KAT.jwe.pt)
  assert.equal(sealJwe(fromHex(KAT.jwe.key), KAT.jwe.pt, fromHex(KAT.jwe.iv), KAT.jwe.kid), KAT.jwe.token)
})

console.log('jwe.js: interoperabilidade')
const key = fromHex(TEST_KEY)
await test('nosso JWE -> jose decifra (0..120 chars, UTF-8)', async () => {
  for (let n = 0; n <= 120; n += 7) {
    const msg = Array.from('Olá ✓ 😀 '.repeat(20)).slice(0, n).join('') // corta por code point
    const tok = sealJwe(key, msg, rnd(16), 'test-1')
    const d = await jose.compactDecrypt(tok, key)
    assert.equal(new TextDecoder().decode(d.plaintext), msg)
    assert.equal(d.protectedHeader.kid, 'test-1')
  }
})
await test('jose -> nosso openJwe e servidor decifram', async () => {
  const msg = 'vindo do jose ✓'
  const tok = await new jose.CompactEncrypt(new TextEncoder().encode(msg))
    .setProtectedHeader({ alg: 'dir', enc: 'A128CBC-HS256', kid: 'test-1' })
    .encrypt(key)
  assert.equal(openJwe(key, tok).plaintext, msg)
  assert.equal(ref.openJwe(tok, TEST_KEY).plaintext, msg)
})
await test('mesma mensagem -> tokens diferentes (IV aleatório)', () => {
  assert.notEqual(sealJwe(key, 'x', rnd(16)), sealJwe(key, 'x', rnd(16)))
})

console.log('servidor: rejeita adulteração')
const good = sealJwe(key, 'mensagem íntegra', rnd(16), 'test-1')
const flip = (tok, part, idx) => {
  const p = tok.split('.')
  const b = Buffer.from(p[part], 'base64url')
  b[idx] ^= 1
  p[part] = b.toString('base64url')
  return p.join('.')
}
const srv = (tok, opts) => ref.handle({ kind: 'aes.msg', payload: { jwe: tok } }, TEST_KEY, opts)
await test('token íntegro passa', () => assert.equal(srv(good).plaintext, 'mensagem íntegra'))
await test('1 bit no ciphertext / IV / tag / cabeçalho', () => {
  assert.equal(srv(flip(good, 3, 5)).error, 'tag inválida')
  assert.equal(srv(flip(good, 2, 0)).error, 'tag inválida')
  assert.equal(srv(flip(good, 4, 15)).error, 'tag inválida')
  assert.equal(srv(flip(good, 0, 3)).ok, false)
})
await test('chave errada, kid exigido, alg trocado, formato quebrado', () => {
  assert.equal(ref.handle({ kind: 'aes.msg', payload: { jwe: good } }, 'ff'.repeat(32)).error, 'tag inválida')
  assert.equal(srv(good, { kid: 'outro' }).error, 'kid desconhecido')
  const p = good.split('.')
  p[0] = Buffer.from(JSON.stringify({ alg: 'dir', enc: 'A256GCM' })).toString('base64url')
  assert.equal(srv(p.join('.')).error, 'alg/enc não suportado')
  assert.equal(srv('a.b.c').error, 'JWE compacto inválido')
  assert.equal(srv(undefined).error, 'JWE compacto inválido')
})

console.log('servidor: outros relatórios')
await test('payload.fatal vira "erro no relógio"', () => {
  const out = ref.handle({ kind: 'aes.msg', payload: { fatal: 'algo falhou' } }, TEST_KEY)
  assert.equal(out.error, 'erro no relógio: algo falhou')
})
await test('analyzeKat lista os vetores que falharam', () => {
  const an = ref.handle(
    { kind: 'aes.kat', payload: { impl: 'js', vectors: { sha256: { ok: true }, cbc: { ok: true, roundtripOk: false }, jwe: { error: 'x' } }, perf: { a: 1 } } },
    TEST_KEY
  ).analise
  assert.equal(an.passaram, 1)
  assert.deepEqual(an.falhas.map((f) => f.vetor), ['cbc', 'jwe'])
})
await test('RNG: aleatório ok, repetido REPROVADO, enviesado SUSPEITO', () => {
  assert.match(ref.analyzeRng({ raw: crypto.randomBytes(1024).toString('base64'), keyLen: 16 }).veredito, /^sem anomalias/)
  const k = crypto.randomBytes(16)
  assert.match(ref.analyzeRng({ raw: Buffer.concat(Array(64).fill(k)).toString('base64'), keyLen: 16 }).veredito, /^REPROVADO/)
  const biased = Buffer.from(Array.from({ length: 1024 }, (_, i) => crypto.randomBytes(1)[0] & 0x0f | (i % 2 ? 0 : 0x10)))
  assert.match(ref.analyzeRng({ raw: biased.toString('base64'), keyLen: 16 }).veredito, /^(SUSPEITO|REPROVADO)/)
})

console.log(process.exitCode ? '\nFALHAS ENCONTRADAS' : `\n${passed} testes passaram`)
