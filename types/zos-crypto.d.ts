// Tipos do @zos/crypto escritos a partir da documentação oficial.
// O pacote @zeppos/device-types (3.0.1 e 4.0.0) ainda não declara este módulo.
// https://docs.zepp.com/docs/reference/device-app-api/newAPI/crypto/AESCrypto/
declare module '@zos/crypto' {
  type CryptoData = number[] | ArrayBuffer | Uint8Array

  export const alg: {
    readonly AES_CBC: number
    readonly ECDSA: number
    readonly MD5: number
    readonly HMACMD5: number
    readonly SHA_1: number
    readonly HMAC_SHA_1: number
    readonly SHA_256: number
    readonly HMAC_SHA_256: number
    readonly [name: string]: number
  }

  export const ecp_dp: {
    readonly SECP192K1: number
    readonly SECP224K1: number
    readonly SECP256K1: number
    readonly [name: string]: number
  }

  interface AESOptions {
    key_bit_length: number
    key_encrypt?: boolean | number
    private_key?: CryptoData
  }
  interface AESKeyResult {
    private_key_length: number
    private_key: ArrayBuffer
  }
  interface CipherResult {
    data: ArrayBuffer
    length: number
  }
  interface AESCrypto {
    createChiper(): AESKeyResult | undefined
    encrypt(data: CryptoData): CipherResult | undefined
    decrypt(data: CryptoData): CipherResult | undefined
  }

  interface DigestOptions {
    key_encrypt?: boolean | number
  }
  interface HMACOptions {
    private_key: CryptoData
    key_encrypt?: boolean | number
  }
  interface DigestResult {
    md_content: ArrayBuffer
    length: number
  }
  interface DigestCrypto {
    encrypt(data: CryptoData): DigestResult | undefined
    start(): void
    update(data: CryptoData): void
    finish(): DigestResult | undefined
  }

  interface ECDSAOptions {
    ecp_dp_mode?: number
    key_encrypt?: boolean | number
    private_key?: CryptoData
    pub_key?: CryptoData
  }
  interface ECDSAKeyResult {
    private_key_length: number
    private_key: ArrayBuffer
    pub_key_length: number
    pub_key: ArrayBuffer
  }
  interface ECDSACrypto {
    createChiper(): ECDSAKeyResult | undefined
    encrypt(data: CryptoData, option: { digest_type: number }): CipherResult | undefined
    decrypt(data: CryptoData, option: { sig_data: CryptoData }): CipherResult | undefined
  }

  export function createCrypto(algorithmId: number, option: AESOptions): AESCrypto | undefined
  export function createCrypto(algorithmId: number, option?: DigestOptions | HMACOptions): DigestCrypto | undefined
  export function createCrypto(algorithmId: number, option?: ECDSAOptions): ECDSACrypto | undefined

  /** AES com a chave PUF do hardware. Entrada múltipla de 16 bytes. API_LEVEL 3.0 */
  export function encryptKey(data: CryptoData): ArrayBuffer | undefined

  /** API_LEVEL 5.0: NÃO disponível no Bip 6 (API_LEVEL 4.2). */
  export function getRandomValues(array: Uint8Array): Uint8Array
}
