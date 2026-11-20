// Configuração da Fase 1 (AES). A chave abaixo é SÓ PARA TESTE: está no código-fonte,
// então qualquer um com o .zab consegue extraí-la. O servidor usa o mesmo valor
// (smartwatch-x402-events: AES_KEY, ou este fallback).

// URL padrão do servidor. Pode ser sobrescrita no Settings App (Zepp App > app > Configurações).
export const DEFAULT_SERVER_URL = ''
export const SETTINGS_KEY_URL = 'serverUrl'

// JWE compacto: alg "dir", enc "A128CBC-HS256" (RFC 7516/7518).
export const PROTOCOL = { format: 'JWE', alg: 'dir', enc: 'A128CBC-HS256', kid: 'test-1' }

// 32 bytes = chave de MAC (16, HMAC-SHA256) || chave de cifragem (16, AES-128).
export const TEST_KEY = 'aa0d22ecf2a18603770b7b5af0a800798f19311a32931c204432ee3a07194944'

// Vetores de teste conhecidos (KAT). Os valores esperados vêm de fontes independentes do
// código do relógio (FIPS/RFC/NIST e OpenSSL/jose) — ver tools/selftest.mjs.
export const KAT = {
  // FIPS-197, Apêndice C.1 (um bloco AES-128)
  aes: {
    key: '000102030405060708090a0b0c0d0e0f',
    pt: '00112233445566778899aabbccddeeff',
    ecb: '69c4e0d86a7b0430d8cdb78070b4c55a',
  },
  // NIST SP 800-38A, F.2.1 (AES-128-CBC, 4 blocos, sem padding)
  cbc: {
    key: '2b7e151628aed2a6abf7158809cf4f3c',
    iv: '000102030405060708090a0b0c0d0e0f',
    pt: '6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710',
    ct: '7649abac8119b246cee98e9b12e9197d5086cb9b507219ee95db113a917678b273bed6b8e3c1743b7116e69e222295163ff1caa1681fac09120eca307586e1a7',
  },
  // FIPS 180-2: SHA-256("abc")
  sha256: {
    msgAscii: 'abc',
    digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  },
  // RFC 4231, caso de teste 1
  hmac: {
    key: '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b',
    msgAscii: 'Hi There',
    mac: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
  },
  // JWE dir + A128CBC-HS256 com chave/IV fixos; token montado pelo OpenSSL e aceito pelo jose.
  jwe: {
    key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    iv: 'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff',
    kid: 'kat',
    pt: 'KAT Bip 6 ✓',
    token:
      'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2Iiwia2lkIjoia2F0In0..8PHy8_T19vf4-fr7_P3-_w.5bX8-3MwoXTda_0VBsSaYw.diiIkrGG_hPSARLaJgUDEg',
  },
}
