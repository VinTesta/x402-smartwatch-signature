// Roda o código REAL do relógio (utils/*.js + shared/*.js) no Node, com o @zos/crypto
// simulado como o Bip 6 se comportou, e confere tudo contra a referência do servidor.
// Inclui um cenário em que uma chamada nativa DERRUBA o relógio: o processo é encerrado
// (reboot) e outro é aberto com os mesmos arquivos, como o relógio religando.
//   npm run devicesim
import { registerHooks, createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const self = fileURLToPath(import.meta.url)
const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zos-fs-'))
const child = (env) =>
  spawnSync(process.execPath, ['--no-warnings', self], { env: Object.assign({}, process.env, env), encoding: 'utf8' })
const show = (out) =>
  process.stdout.write(
    out
      .split('\n')
      .filter((l) => l && !l.startsWith('[crumb]') && !l.startsWith('RESULT '))
      .map((l) => l + '\n')
      .join('')
  )

if (!process.env.ZOS_MODE) {
  let failed = 0
  for (const mode of ['bip6', 'keygen-broken']) {
    const r = child({ ZOS_MODE: mode, ZOS_FS_DIR: fresh() })
    show(r.stdout)
    if (r.status !== 0) {
      failed++
      process.stderr.write(r.stderr)
    }
  }

  // crash-keygen: 1º boot derruba o relógio; o 2º precisa detectar, bloquear e seguir.
  console.log('[crash-keygen] (reboot simulado)')
  const dir = fresh()
  const first = child({ ZOS_MODE: 'crash-keygen', ZOS_FS_DIR: dir })
  show(first.stdout)
  const second = child({ ZOS_MODE: 'crash-keygen', ZOS_FS_DIR: dir })
  show(second.stdout)
  try {
    assert.equal(first.status, 99, 'o 1º boot deveria ter "reiniciado"')
    assert.equal(second.status, 0, second.stderr)
    const res = JSON.parse(second.stdout.split('\n').find((l) => l.startsWith('RESULT ')).slice(7))
    assert.equal(res.crashed, 'aes.keygen.createChiper')
    assert.match(res.rng, /^math-random-INSEGURO \(BLOQUEADO/)
    assert.equal(res.msg.ok, true, JSON.stringify(res.msg))
    console.log('  ok  crash identificado no reboot e bloqueado; RNG cai para o modo marcado INSEGURO')
    console.log('  ok  a mensagem continua sendo cifrada e o servidor decifra')
  } catch (e) {
    failed++
    console.error('  FALHOU [crash-keygen] ' + e.message)
  }

  console.log(failed ? `\n${failed} cenário(s) FALHARAM` : '\nTodos os 3 cenários passaram')
  process.exit(failed ? 1 : 0)
}

// ------------------------------------------------------------------ processo filho
const mode = process.env.ZOS_MODE
globalThis.__ZOS_MODE = mode
const mocks = {
  '@zos/crypto': new URL('./mocks/zos-crypto.mjs', import.meta.url).href,
  '@zos/device': new URL('./mocks/zos-misc.mjs', import.meta.url).href,
  '@zos/settings': new URL('./mocks/zos-misc.mjs', import.meta.url).href,
  '@zos/fs': new URL('./mocks/zos-fs.mjs', import.meta.url).href,
}
registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true }
    return next(specifier, context)
  },
})

const require = createRequire(import.meta.url)
const ref = require('./aes-reference.cjs')
const crumbs = await import('../utils/crumbs.js')
const T = await import('../utils/phase1-tests.js')
const { TEST_KEY } = await import('../shared/config.js')

// Como a página faz ao abrir.
const crashed = crumbs.recoverFromCrash()

if (mode === 'crash-keygen') {
  const seal = T.runSeal('depois do reboot ✓')
  crumbs.clearCrumb()
  const msg = ref.handle({ kind: 'aes.msg', payload: seal }, TEST_KEY)
  console.log('RESULT ' + JSON.stringify({ crashed, rng: seal.rng, msg }))
  process.exit(0)
}

console.log(`[${mode}]`)
function check(name, fn) {
  try {
    fn()
    console.log('  ok  ' + name)
  } catch (e) {
    console.error(`  FALHOU [${mode}] ${name}\n${e.stack}`)
    process.exitCode = 1
  }
}

const probe = T.runProbe()
check('sondagem (sem MAC/UUID)', () => {
  assert.equal(probe.nativeCrypto, true)
  assert.deepEqual(Object.keys(probe.device).sort(), ['deviceName', 'deviceSource', 'height', 'screenShape', 'width'])
  assert.equal(probe.rngSource, mode === 'bip6' ? 'aes-keygen+sha256' : 'math-random-INSEGURO (createChiper retornou undefined)')
})

const kat = T.runKat()
check('KAT em JS puro: todos os vetores (AES bloco, CBC, SHA-256, HMAC, JWE)', () => {
  assert.equal(kat.passed, kat.total, JSON.stringify(kat.vectors))
  assert.equal(ref.handle({ kind: 'aes.kat', payload: kat }, TEST_KEY).analise.falhas.length, 0)
  for (const k of ['aesCbc1KB_ms', 'sha256_1KB_ms', 'hmac_1KB_ms', 'jwe100B_ms']) assert.equal(typeof kat.perf[k], 'number')
})

check('mensagem real: JWE decifrado pelo servidor', () => {
  const msg = 'Olá do Bip 6! ação ✓ #1'
  const out = ref.handle({ kind: 'aes.msg', payload: T.runSeal(msg) }, TEST_KEY, { kid: 'test-1' })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.plaintext, msg)
})

if (mode === 'bip6') {
  check('RNG: 8 chaves do firmware, sem repetição', () => {
    const r = T.runRng(8)
    assert.equal(r.count, 8)
    assert.equal(r.duplicates, 0)
  })
}

check('NENHUMA chamada a encrypt/decrypt/digest/checkAvailable nativos', () => {
  const c = globalThis.__ZOS_CALLS
  for (const f of ['encrypt', 'decrypt', 'digest', 'checkAvailable', 'encryptKey']) assert.equal(c[f] || 0, 0, f + ' foi chamado')
  assert.ok(c.createChiper > 0)
})

check('migalha limpa ao fim de um teste sem crash', () => {
  crumbs.clearCrumb()
  assert.equal(crumbs.recoverFromCrash(), null)
})
