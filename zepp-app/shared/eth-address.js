// Deriva o endereço Ethereum a partir da chave privada. Roda SÓ NO CELULAR (Side Service e
// Settings App): no relógio o getPublic levou ~20 s e às vezes reiniciou o aparelho.
//
// FASE DE TESTE: isto só é possível porque o celular conhece a chave (digitada nas
// Configurações). Na arquitetura final a chave é gerada no relógio e o celular não a conhece;
// aí o endereço é calculado uma única vez no relógio, na geração da chave.
//
// Mesmos submódulos do elliptic usados no relógio (a raiz do pacote não empacota no Zeus).
import EC from 'elliptic/lib/elliptic/ec/index.js'
import ecUtils from 'elliptic/lib/elliptic/utils.js'
import { keccak256 } from 'js-sha3'

let ec = null

/**
 * @param {string} privateKeyHex chave privada, 64 hex com ou sem "0x"
 * @returns {string} endereço em minúsculas, com "0x"
 */
export function addressFromPrivateKey(privateKeyHex) {
  if (!ec) ec = new EC('secp256k1')
  const hex = String(privateKeyHex).replace(/^0x/, '')
  const pub = ec.keyFromPrivate(hex, 'hex').getPublic(false, 'hex') // "04" + x + y
  return '0x' + keccak256(ecUtils.toArray(pub.slice(2), 'hex')).slice(-40)
}
