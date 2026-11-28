# Referências usadas na pesquisa (até 2026-11-27)

Levantamento das especificações, documentações, bibliotecas, ferramentas e repositórios usados nas
Fases 1 e 2. A coluna "Uso" diz onde cada item entrou no trabalho. Serve de base para a seção de
referências do artigo, que hoje tem marcações `[referencia]` em aberto.

Legenda da coluna **Fonte**:

- **consultada:** página lida durante os experimentos;
- **implementada/testada:** a especificação foi implementada e conferida contra vetores ou bibliotecas de
  referência;
- **citada:** mencionada no texto, sem leitura registrada nas sessões. Precisa ser conferida antes de
  entrar no artigo.

## 1. Protocolo x402 e pagamentos

| Referência | URL | Uso | Fonte |
|---|---|---|---|
| x402: site oficial do protocolo | https://www.x402.org/ | Definição do protocolo; README do repositório | consultada |
| x402: repositório de referência (Coinbase) | https://github.com/coinbase/x402 | SDK e middleware; esquema `exact` em EVM; previsto para a Fase 3 | citada |
| HTTP 402 *Payment Required*: RFC 9110, §15.5.3 | https://www.rfc-editor.org/rfc/rfc9110#section-15.5.3 | Status reaproveitado pelo x402 (introdução do artigo) | citada |

## 2. Especificações Ethereum (Fase 2)

| Referência | URL | Uso | Fonte |
|---|---|---|---|
| EIP-712: *Typed structured data hashing and signing* | https://eips.ethereum.org/EIPS/eip-712 | Hash do `TransferWithAuthorization` no relógio (`domainSeparator`, `hashStruct`, prefixo `0x1901`) | implementada/testada (digest igual ao `viem` em 300 casos e no aparelho) |
| EIP-3009: *Transfer With Authorization* | https://eips.ethereum.org/EIPS/eip-3009 | Tipo assinado (`from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`) | implementada/testada |
| EIP-2: regra do `s` baixo (*Homestead*) | https://eips.ethereum.org/EIPS/eip-2 | `canonical: true` no `elliptic` e verificação `lowS` no `/validate` | implementada/testada |
| EIP-55: endereços com checksum em maiúsculas/minúsculas | https://eips.ethereum.org/EIPS/eip-55 | Formato dos endereços aceitos/retornados (`viem` `getAddress`) | citada |
| Keccak-256: FIPS 202 (SHA-3), na variante Keccak original usada pelo Ethereum | https://csrc.nist.gov/pubs/fips/202/final | Hash do EIP-712 e derivação do endereço (`js-sha3` `keccak256`) | implementada/testada |
| USDC na Base Sepolia (contrato `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, versão `2`) | https://developers.circle.com/stablecoins/usdc-contract-addresses | Domínio EIP-712 fixo no relógio | citada |
| Base Sepolia (chainId 84532) | https://docs.base.org/ | `chainId` do domínio; rede da Fase 3 | citada |
| Contas padrão do Hardhat/Anvil (conta nº 1, `0x7099…79C8`) | https://book.getfoundry.sh/reference/anvil/ | `TEST_PAY_TO`, destinatário genérico de teste | citada |

## 3. Criptografia: padrões e vetores

| Referência | URL | Uso | Fonte |
|---|---|---|---|
| SEC 2: parâmetros da curva secp256k1 | https://www.secg.org/sec2-v2.pdf | Curva da assinatura | implementada/testada (via `elliptic`) |
| SEC 1: ECDSA e recuperação da chave pública | https://www.secg.org/sec1-v2.pdf | Assinatura e `recoveryParam` (`v = 27 + recid`) | implementada/testada |
| RFC 6979: nonce determinístico para ECDSA | https://www.rfc-editor.org/rfc/rfc6979 | `k` da assinatura sem RNG; assinaturas byte a byte iguais às do `viem` | implementada/testada |
| RFC 2104: HMAC | https://www.rfc-editor.org/rfc/rfc2104 | HMAC-SHA256 da Fase 1 (base do HMAC-DRBG do RFC 6979) | implementada/testada |
| RFC 4231: vetores HMAC-SHA256 | https://www.rfc-editor.org/rfc/rfc4231 | KAT no relógio (Fase 1) | implementada/testada |
| FIPS 180-4 (antes 180-2): SHA-256 | https://csrc.nist.gov/pubs/fips/180-4/upd1/final | SHA-256 em JS puro e vetores (Fase 1) | implementada/testada |
| FIPS 197: AES | https://csrc.nist.gov/pubs/fips/197/final | AES-128 em JS puro e vetores (Fase 1) | implementada/testada |
| NIST SP 800-38A: modos de operação (CBC, vetor F.2.1) | https://csrc.nist.gov/pubs/sp/800/38/a/final | AES-CBC e KAT (Fase 1) | implementada/testada |
| RFC 7516: JSON Web Encryption (JWE) | https://www.rfc-editor.org/rfc/rfc7516 | Formato da mensagem cifrada (Fase 1) | implementada/testada |
| RFC 7518 §5.2.2: `A128CBC-HS256` | https://www.rfc-editor.org/rfc/rfc7518#section-5.2.2 | Algoritmo do JWE (Fase 1) | implementada/testada |

## 4. Plataforma Zepp OS e hardware

| Referência | URL | Uso | Fonte |
|---|---|---|---|
| Documentação Zepp OS (portal) | https://docs.zepp.com/ | Device App, Side Service, Settings App, API_LEVEL | consultada (Fase 1, E0) |
| `@zos/crypto`, página AESCrypto | https://docs.zepp.com/docs/reference/device-app-api/newAPI/crypto/AESCrypto/ | Levantamento da API nativa (E0); depois descartada (devolve `undefined` e reinicia o aparelho) | consultada |
| Zepp OS: suporte a JavaScript (ES6; diz que não há `Promise`/timers, o que o Bip 6 desmentiu) | https://docs.zepp.com/ (seção *JavaScript Support*) | Tabela de capacidades do runtime (Fase 1, E2) | consultada |
| Zepp OS: `@zos/display` (`setPageBrightTime`, `pauseDropWristScreenOff`) | https://docs.zepp.com/ (Device App API › display) | Manter a tela acesa durante a assinatura (Fase 2) | citada |
| Zepp OS: `@zos/fs` | https://docs.zepp.com/ (Device App API › fs) | Migalhas em arquivo (`sign_trace.json`) | citada |
| ZML (`@zeppos/zml` 0.0.38): `BaseApp`, `BasePage`, `BaseSideService`, mensagens BLE | https://github.com/zepp-health/zml | Transporte relógio ↔ celular | testada |
| Zeus CLI (`@zeppos/zeus-cli`, zpm 3.5.0: Rollup + `qjsc`) | https://docs.zepp.com/ (Guides › Tools › CLI) | Build do app; `qjsc` sem `BigInt` (E1) | testada |
| `@zeppos/device-types` 3.0.1 | https://www.npmjs.com/package/@zeppos/device-types | Tipos; não declara `@zos/crypto` | testada |
| Amazfit Bip 6 (página do produto) | https://www.amazfit.com/ | Aparelho do experimento (introdução do artigo) | citada |
| QuickJS (Fabrice Bellard) | https://bellard.org/quickjs/ | Runtime do relógio; `qjsc` de 2020-07-05 sem `CONFIG_BIGNUM` | testada |

## 5. Bibliotecas usadas

| Biblioteca | Versão | Repositório | Onde | Uso |
|---|---|---|---|---|
| `elliptic` | 6.6.1 | https://github.com/indutny/elliptic | relógio, celular | secp256k1, ECDSA, RFC 6979 (submódulos `ec` e `utils`) |
| `bn.js` | 4.12.5 | https://github.com/indutny/bn.js | relógio, celular | Inteiros grandes sem `BigInt` (limbs de 26 bits) |
| `hmac-drbg`, `hash.js`, `brorand`, `minimalistic-*`, `inherits` | 1.0.1 / 1.1.7 / 1.1.0 / 1.0.1 / 2.0.4 | https://github.com/indutny | relógio | Dependências do `elliptic` (HMAC-DRBG do RFC 6979) |
| `js-sha3` | 0.9.3 | https://github.com/emn178/js-sha3 | relógio, celular | Keccak-256 |
| `viem` | 2.58.6 | https://github.com/wevm/viem | servidor, testes | Verificador independente: `hashTypedData`, `signTypedData`, `recoverAddress`, `recoverTypedDataAddress` |
| `@noble/curves`, `@noble/hashes` | 1.9.1 / 1.8.0 | https://github.com/paulmillr/noble-curves | testes (via `viem`) | Referência; **não** usadas no relógio (dependem de `BigInt`) |
| `jose` | 6.2.18 | https://github.com/panva/jose | testes (Fase 1) | Interoperabilidade do JWE |
| OpenSSL | — | https://www.openssl.org/ | testes (Fase 1) | Referência para AES/HMAC |
| `quickjs-emscripten` | 0.32.0 | https://github.com/justjake/quickjs-emscripten | medições (Fase 2) | QuickJS em WASM: tempo, heap e memória mínima do fluxo |
| `esbuild` | — | https://github.com/evanw/esbuild | ferramentas | Bundle das libs para o QuickJS e do Side Service simulado |

## 6. Infraestrutura

| Referência | URL | Uso |
|---|---|---|
| Vercel: funções serverless em Node, `vercel.json` (`rewrites`) | https://vercel.com/docs/functions | Hospedagem de `/invoice` e `/validate` |
| Node.js 24 | https://nodejs.org/ | Servidor local e todos os testes |

## 7. Repositórios do projeto

| Repositório | URL | Papel |
|---|---|---|
| Este repositório (`main`) | https://github.com/VinTesta/x402-smartwatch-signature | Artigo, `zepp-app/`, `invoice-server/` (Fases 2 e 3) |
| Protótipo da Fase 1 (tag `prototype-0.1`) | https://github.com/VinTesta/x402-smartwatch-signature/tree/prototype-0.1 | Mini app experimental da Fase 1 (AES/HMAC/JWE, migalhas, sondagem) |
| Servidor publicado | https://github.com/VinTesta/smartwatch-x402-events | Deploy na Vercel (Fase 1: JWE; Fase 2: `/invoice` e `/validate`) |

## 8. Pendências para o artigo

- A introdução cita `[referencia]` para: x402, Amazfit Bip 6, Coinbase, HTTP 402, Ethereum, Solana e
  Stellar. Faltam no levantamento as páginas de Ethereum (https://ethereum.org/), Solana
  (https://solana.com/) e Stellar (https://stellar.org/), que só aparecem no texto do artigo.
- A proposta original cita uma referência **[35]** sobre a ausência de `BigInt` em outro modelo de
  relógio Zepp. O texto da proposta não está neste repositório, então a referência precisa ser
  recuperada dela.
- Itens marcados como **citada** precisam ter URL, título e data de acesso conferidos antes de entrar
  no artigo.
- Não há, até aqui, artigos acadêmicos lidos nas sessões. Candidatos naturais: o artigo do ECDSA
  (Johnson, Menezes e Vanstone, 2001), trabalhos sobre carteiras em dispositivos restritos/IoT e
  medições de ECC em microcontroladores.
