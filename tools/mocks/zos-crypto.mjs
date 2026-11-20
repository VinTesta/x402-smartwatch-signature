// Mock do @zos/crypto para rodar o código do relógio no Node (tools/device-sim-test.mjs).
// globalThis.__ZOS_MODE escolhe o comportamento:
//   bip6          -> o que observamos no Bip 6 (fw 4.6.0.3): createChiper() funciona;
//                    encrypt() devolve undefined; AES encrypt(number[]) REINICIA o relógio
//   keygen-broken -> createChiper() também devolve undefined
//   crash-keygen  -> createChiper() REINICIA o relógio
// "Reiniciar o relógio" = encerrar o processo (exit 99).
// globalThis.__ZOS_CALLS conta as chamadas nativas (o teste exige zero encrypt()).
import crypto from 'node:crypto'

const mode = () => globalThis.__ZOS_MODE || 'bip6'
const calls = (globalThis.__ZOS_CALLS = globalThis.__ZOS_CALLS || {})
const count = (name) => (calls[name] = (calls[name] || 0) + 1)

function reboot(where) {
  process.stdout.write('    !! crash simulado em ' + where + '\n')
  process.exit(99)
}

function ids(map) {
  const o = {}
  for (const [k, v] of Object.entries(map)) Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true })
  return o
}
export const alg = ids({ ECDSA: 0, AES_CBC: 1, AES_ECB: 2, AES_CFB: 3, '3DES': 4, SHA_256: 5, MD5: 6, HMACMD5: 7, HMAC_SHA_256: 8, CRC16: 9, CRC32: 10, SHA_1: 11, HMAC_SHA_1: 12 })
export const ecp_dp = ids({ SECP192K1: 0, SECP224K1: 1, SECP256K1: 2 })
export function checkAvailable() {
  count('checkAvailable')
  return true
}
export function digest() {
  count('digest')
  return undefined
}
export function encryptKey() {
  count('encryptKey')
  return undefined
}

export function createCrypto(id) {
  count('createCrypto')
  return {
    createChiper() {
      count('createChiper')
      if (mode() === 'crash-keygen') reboot('createChiper')
      if (mode() === 'keygen-broken') return undefined
      return { private_key: new Uint8Array(crypto.randomBytes(16)).buffer, private_key_length: 16 }
    },
    encrypt(d) {
      count('encrypt')
      if (id === alg.AES_CBC && Array.isArray(d)) reboot('AES encrypt(number[])')
      return undefined
    },
    decrypt() {
      count('decrypt')
      return undefined
    },
  }
}

export default { alg, ecp_dp, createCrypto, checkAvailable, digest, encryptKey }
