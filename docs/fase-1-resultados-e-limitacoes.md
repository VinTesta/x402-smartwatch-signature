# Fase 1: resultados e limitações do hardware

Resumo dos experimentos feitos em 19 e 20 nov. 2026. O código, o relatório completo e as
evidências brutas da Fase 1 estão na release
[`prototype-0.1`](https://github.com/VinTesta/x402-smartwatch-signature/tree/prototype-0.1)
deste repositório (app do relógio) e em
[`VinTesta/smartwatch-x402-events`](https://github.com/VinTesta/smartwatch-x402-events) (servidor).
Este arquivo registra só o que foi aprendido, para servir de base ao artigo e às próximas fases.

## Ambiente

| Item | Valor |
|---|---|
| Relógio | Amazfit Bip 6, Zepp OS 5, firmware 4.6.0.3, API_LEVEL 4.2 |
| Celular | iPhone, iOS 26.6.1, app Zepp 10.10.5 em modo desenvolvedor |
| Toolchain | Zeus CLI 1.10.1 (zpm 3.5.0, `qjsc` QuickJS 2020-07-05), Node.js 24, Linux |
| Servidor | Função serverless na Vercel (Node) |

## Resultado principal

O relógio cifrou uma mensagem com **AES-128-CBC + HMAC-SHA256 implementados em JavaScript puro**,
no formato padrão **JWE compacto `dir` + `A128CBC-HS256`** (RFC 7516/7518). A mensagem foi
transportada por BLE até o app Zepp no iPhone, enviada por HTTPS ao servidor, e o servidor
**decifrou com sucesso** (inclusive com a biblioteca `jose`, de forma independente).

| Medida (1 amostra, 20 nov. 2026) | Valor |
|---|---|
| Cifrar JWE de 43 bytes no relógio (3 blocos AES + 6 compressões SHA-256) | **143 ms** |
| Gerar IV de 16 bytes (keygen do firmware + 1 SHA-256) | **349 ms** |
| Side Service → servidor → Side Service | 189–1.238 ms |
| Criação no relógio → chegada no celular | ≈ 1,5 s |

Arquitetura validada: **relógio (assina/cifra) → BLE (ZML) → Side Service no app Zepp (só repassa) → HTTPS → servidor (verifica)**.

## Limitações do hardware e do runtime

### 1. Sem `BigInt`

- O `qjsc` distribuído pelo Zeus é QuickJS 2020-07-05 compilado **sem `CONFIG_BIGNUM`**:
  `1n` falha com `SyntaxError: invalid number literal`; `-fbignum` responde `unsupported feature: bignum`.
- No aparelho, `typeof BigInt === 'undefined'`.
- **Consequência:** bibliotecas modernas de curva elíptica (`@noble/*`) não compilam nem rodam.
  A aritmética de 256 bits precisa ser feita com `Number` em *limbs* (ex.: 26 bits, como no `bn.js`/`elliptic`).

### 2. O runtime não é o que a documentação descreve

| Recurso | Bip 6 | Documentação |
|---|---|---|
| Sintaxe ES2020 (`?.`, `??`, `**`, `async`, classes) | compila | "ES6" |
| `Promise`, `setTimeout` | **existem** | "não suportados" |
| `TextEncoder`/`TextDecoder`, `atob`/`btoa`, `eval` | ausentes | — |
| `Uint8Array`, `DataView`, `Proxy`, `WeakMap`, `Symbol`, `Math.imul` | presentes | — |
| `getRandomValues` | ausente | só API_LEVEL 5.0 |

UTF-8, base64/base64url e hex tiveram de ser reimplementados.

### 3. A API nativa de criptografia (`@zos/crypto`) é inutilizável

| Operação | Resultado no Bip 6 |
|---|---|
| `SHA_256` / `HMAC_SHA_256` `.encrypt` (`Uint8Array`, `ArrayBuffer`) | devolve `undefined` |
| `AES_CBC.encrypt` (`Uint8Array`, `ArrayBuffer`, com/sem `key_encrypt`) | devolve `undefined` |
| `AES_CBC.encrypt` com `number[]` | **reinicia o relógio inteiro** |
| `createChiper()` com `private_key` | ignora a chave e devolve outra aleatória |
| `createChiper()` sem chave | **funciona**: gera chave aleatória (única operação útil) |
| ECDSA nativo | só aceita digest MD5/HMAC-MD5, incompatível com EIP-712 (Keccak-256) |
| `encryptKey` (chave de hardware/PUF) | não testado |

Outros pontos:
- O módulo exporta funções não documentadas (`checkAvailable`, `digest`) e as constantes
  de algoritmo não são enumeráveis (`Object.keys(alg)` devolve `[]`).
- O pacote `@zeppos/device-types` não declara `@zos/crypto` (tipos escritos à mão).
- O firmware do simulador contém só o esqueleto do módulo, sem as implementações:
  **o simulador não serve para testar criptografia** (nem executa o Side Service).
  Todo teste relevante precisa ser feito no aparelho.

**Decisão:** toda a criptografia é feita em JS puro. O nativo só é usado como fonte de entropia.

### 4. Chamadas nativas podem derrubar o sistema

Um argumento de tipo errado reinicia o SO do relógio, sem exceção capturável. Aconteceu duas vezes.
Foi criado o mecanismo de **migalhas** (`crumbs`): grava em arquivo o nome da chamada nativa antes
de executá-la; se a migalha existir no próximo boot, a chamada derrubou o relógio e é bloqueada.
Identificou corretamente `aes.encrypt.arr` na primeira vez em que foi necessário.

### 5. Aleatoriedade lenta e não documentada

- Sem `getRandomValues` (API 4.2). Substituto: `createChiper()` de uma instância AES sem chave.
- 128 chaves × 16 bytes: 0 repetições, χ² = 270,3 (z = 0,68), proporção de bits 1 = 0,5045.
  Sem anomalias grosseiras, mas **não prova qualidade criptográfica**.
- Custo: **~301 ms por 16 bytes**.
- Uso: `SHA-256(createChiper() || contador || Date.now())`. A assinatura ECDSA com RFC 6979
  é determinística e não precisa de aleatoriedade; a geração da chave da carteira e o nonce
  do EIP-3009 sim.

### 6. Transporte BLE

- Payload útil por frame ZML: 3.584 bytes; mensagens maiores são fragmentadas automaticamente
  (4.806 bytes em 2 frames, entregue íntegra).
- Em modo desenvolvedor, o **app Zepp registra em log todo payload BLE** e todo corpo HTTP:
  o celular vê tudo. A integridade do pagamento precisa vir só da assinatura feita no relógio.
- O Side Service é marcado como ocioso ~10 min após o último uso (relevante para o ciclo de vida no iOS).

### 7. Ciclo de desenvolvimento lento

Instalar via `zeus bridge`, tocar botões e copiar logs. Mitigação adotada: manter a lógica em
código puro testado no Node contra OpenSSL/`jose`, e rodar o código do relógio no Node com
`@zos/*` simulados antes de ir ao aparelho.

## Implicações para a próxima fase (assinatura x402)

- secp256k1 + RFC 6979 + Keccak-256 + EIP-712 **em JS puro, sem `BigInt`** (ex.: `elliptic`/`bn.js`
  ou implementação própria com limbs de 26 bits).
- HMAC-SHA256 da Fase 1 já validado: base do HMAC-DRBG do RFC 6979.
- Validação byte a byte contra `viem`/`@noble/curves` no Node (assinaturas determinísticas).
- Riscos: tempo de assinatura no QuickJS interpretado (limite de refutação da H2: 10 s),
  possível watchdog para execução longa (fatiar com `setTimeout`), tamanho do bundle.

## Pendências da Fase 1

- Registrar os tempos por primitiva (botão KAT) e repetir o envio ≥ 10 vezes (mediana e p95).
- Medir memória disponível e tempo máximo de execução contínua de um Device App.
- Testar `encryptKey` isoladamente, com migalha.
