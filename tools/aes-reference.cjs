#!/usr/bin/env node
// Referência do lado do SERVIDOR para a Fase 1 (Node >= 18, só o módulo `crypto` nativo).
//
// Mensagens do relógio: JWE compacto, alg "dir", enc "A128CBC-HS256" (RFC 7516/7518).
// Qualquer biblioteca JOSE (ex.: `jose`) também decifra; aqui fica sem dependências.
//
// Use como biblioteca no servidor (ex.: smartwatch-x402-events/lib/aes-reference.cjs):
//   const { handle } = require('../lib/aes-reference.cjs')
//   const result = handle(body, process.env.AES_KEY)   // AES_KEY = 64 dígitos hex
//
// Ou pela linha de comando, colando o JSON que o app-side loga ("[side] envelope {...}"):
//   node tools/aes-reference.cjs envelope.json
//   cat envelope.json | node tools/aes-reference.cjs -
'use strict'

const crypto = require('crypto')

const ENC = 'A128CBC-HS256'

// ------------------------------------------------------------------ JWE
function b64u(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url inválido')
  return Buffer.from(s, 'base64url')
}

/**
 * Abre um JWE compacto dir + A128CBC-HS256.
 * @param token   string "h..iv.ct.tag"
 * @param keyHex  32 bytes em hex (MAC_KEY 16 || ENC_KEY 16)
 * @param opts    { kid?: string }  // se informado, o cabeçalho precisa ter este kid
 */
function openJwe(token, keyHex, opts = {}) {
  const parts = String(token).split('.')
  if (parts.length !== 5 || parts[1] !== '') throw new Error('JWE compacto inválido')
  const key = Buffer.from(String(keyHex), 'hex')
  if (key.length !== 32) throw new Error('chave deve ter 32 bytes')

  let header
  try {
    header = JSON.parse(b64u(parts[0]).toString('utf8'))
  } catch (e) {
    throw new Error('cabeçalho inválido')
  }
  if (header.alg !== 'dir' || header.enc !== ENC) throw new Error('alg/enc não suportado')
  if (opts.kid && header.kid !== opts.kid) throw new Error('kid desconhecido')

  const aad = Buffer.from(parts[0], 'ascii')
  const iv = b64u(parts[2])
  const ct = b64u(parts[3])
  const tag = b64u(parts[4])
  if (iv.length !== 16 || tag.length !== 16 || !ct.length || ct.length % 16) throw new Error('tamanhos inválidos')

  // 1) tag primeiro: nada é decifrado se a autenticação falhar
  const al = Buffer.alloc(8)
  al.writeBigUInt64BE(BigInt(aad.length * 8))
  const expected = crypto.createHmac('sha256', key.subarray(0, 16)).update(Buffer.concat([aad, iv, ct, al])).digest().subarray(0, 16)
  if (!crypto.timingSafeEqual(tag, expected)) throw new Error('tag inválida')

  // 2) AES-128-CBC com PKCS#7
  const d = crypto.createDecipheriv('aes-128-cbc', key.subarray(16, 32), iv)
  let pt
  try {
    pt = Buffer.concat([d.update(ct), d.final()])
  } catch (e) {
    throw new Error('padding inválido')
  }
  return { header, plaintext: pt.toString('utf8'), bytes: pt.length }
}

// ------------------------------------------------------------------ KAT
/** Resume o botão "2 · KAT" (vetores conferidos no próprio relógio + tempos). */
function analyzeKat(kat) {
  const v = (kat && kat.vectors) || {}
  const falhas = Object.keys(v).filter(
    (n) => !(v[n] && v[n].ok === true && v[n].decryptOk !== false && v[n].roundtripOk !== false && v[n].openOk !== false)
  )
  return {
    impl: kat && kat.impl,
    passaram: Object.keys(v).length - falhas.length,
    total: Object.keys(v).length,
    falhas: falhas.map((n) => ({ vetor: n, detalhe: v[n] })),
    tempos_ms: (kat && kat.perf) || null,
  }
}

// ------------------------------------------------------------------ RNG
/** Estatística simples das chaves cruas do createChiper(). Amostra pequena: só pega falhas grosseiras. */
function analyzeRng(r) {
  const raw = Buffer.from((r && r.raw) || '', 'base64')
  if (!raw.length) return { error: 'sem amostras', relatorio: r }
  const keyLen = r.keyLen || 16
  const keys = new Set()
  for (let i = 0; i < raw.length; i += keyLen) keys.add(raw.subarray(i, i + keyLen).toString('hex'))
  const count = Math.floor(raw.length / keyLen)

  const hist = new Array(256).fill(0)
  let ones = 0
  for (const b of raw) {
    hist[b]++
    for (let x = b; x; x >>= 1) ones += x & 1
  }
  const exp = raw.length / 256
  const chi2 = hist.reduce((s, o) => s + ((o - exp) * (o - exp)) / exp, 0)
  const z = (chi2 - 255) / Math.sqrt(2 * 255) // aprox. normal, gl = 255
  const onesRatio = ones / (raw.length * 8)

  const duplicates = count - keys.size
  let veredito = 'sem anomalias óbvias (amostra pequena; não prova qualidade criptográfica)'
  if (duplicates > 0) veredito = 'REPROVADO: chaves repetidas'
  else if (Math.abs(z) > 4 || Math.abs(onesRatio - 0.5) > 0.03) veredito = 'SUSPEITO: distribuição fora do esperado'

  return {
    bytes: raw.length,
    chaves: count,
    duplicadas: duplicates,
    chi2: Number(chi2.toFixed(1)),
    z: Number(z.toFixed(2)),
    proporcaoDeUns: Number(onesRatio.toFixed(4)),
    msNoRelogio: r.ms,
    veredito,
  }
}

// ------------------------------------------------------------------ dispatcher
/**
 * Trata o corpo enviado pelo app-side: { kind, payload, side }.
 * Devolve um objeto pequeno (vai aparecer na tela do relógio).
 */
function handle(body, keyHex, opts = {}) {
  const kind = body && body.kind
  const payload = body && body.payload
  // O relógio falhou antes de montar o relatório/mensagem: repassa o erro de lá.
  if (payload && payload.fatal) return { ok: false, kind, error: 'erro no relógio: ' + payload.fatal }
  try {
    switch (kind) {
      case 'probe':
        return {
          ok: true,
          kind,
          bigint: payload && payload.js && payload.js.BigInt,
          api: payload && payload.system && payload.system.minAPI,
          rng: payload && payload.rngSource,
        }
      case 'aes.kat':
        return { ok: true, kind, analise: analyzeKat(payload) }
      case 'aes.rng':
        return { ok: true, kind, analise: analyzeRng(payload) }
      case 'aes.msg': {
        const r = openJwe(payload && payload.jwe, keyHex, opts)
        return {
          ok: true,
          kind,
          plaintext: r.plaintext,
          bytes: r.bytes,
          kid: r.header.kid,
          rng: payload.rng,
          msNoRelogio: { rng: payload.rng_ms, cifrar: payload.seal_ms },
        }
      }
      default:
        return { ok: false, error: 'kind desconhecido: ' + kind }
    }
  } catch (e) {
    return { ok: false, kind, error: e.message }
  }
}

module.exports = { ENC, openJwe, analyzeKat, analyzeRng, handle }

// ------------------------------------------------------------------ CLI
if (require.main === module) {
  const fs = require('fs')
  const path = require('path')
  const arg = process.argv[2]
  if (!arg) {
    console.error('uso: node tools/aes-reference.cjs <arquivo.json | ->')
    process.exit(2)
  }
  const text = fs.readFileSync(arg === '-' ? 0 : arg, 'utf8')
  // aceita a linha de log inteira ("[side] envelope {...}"): pega do primeiro "{" em diante
  const body = JSON.parse(text.slice(text.indexOf('{')))

  // Chave: variável de ambiente AES_KEY ou a chave de teste de shared/config.js
  import(require('url').pathToFileURL(path.join(__dirname, '..', 'shared', 'config.js')).href)
    .then(({ TEST_KEY }) => {
      console.log(JSON.stringify(handle(body, process.env.AES_KEY || TEST_KEY), null, 2))
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
