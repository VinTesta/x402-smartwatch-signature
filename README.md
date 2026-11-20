# Criptografia moderna no Amazfit Bip 6 (Zepp OS): Fase 1

Repositório experimental da pesquisa **"Assinatura de pagamentos x402 em um smartwatch: avaliação de um assinante vestível restrito"** (Vinicius Passos, QI Tech).

A pesquisa investiga se um relógio comercial, o Amazfit Bip 6 com Zepp OS, consegue atuar como **assinante de pagamentos x402**. A ideia é que ele guarde uma chave privada (hot wallet local), mostre valor e destinatário, aplique uma política de gastos e calcule **no próprio relógio** a assinatura ECDSA secp256k1 de uma autorização EIP-3009/EIP-712. O celular só transporta mensagens, e um servidor executa a transação.

Este repositório é a **primeira etapa experimental**. Antes de investir em curvas elípticas, ele verifica o que o runtime do relógio realmente oferece, se dá para fazer criptografia moderna nele e se o caminho **relógio → celular → servidor** funciona de ponta a ponta.

> **Resultado principal:** o relógio cifrou uma mensagem com **AES-128-CBC + HMAC-SHA256 em JavaScript puro** (formato **JWE `dir` + `A128CBC-HS256`**, RFC 7516/7518). Ela foi transportada por BLE até o app Zepp no iPhone, enviada por HTTPS a um servidor na Vercel, e o servidor **decifrou com sucesso**. No teste final (20 nov. 2026), cifrar a mensagem levou **143 ms** no relógio. O caminho até lá exigiu abandonar a API nativa de criptografia do relógio, que se mostrou inutilizável no Bip 6 e, com um tipo de argumento, **reinicia o aparelho**.

## Sumário

- [Resumo dos achados](#resumo-dos-achados)
- [1. Contexto e objetivo](#1-contexto-e-objetivo)
- [2. Arquitetura](#2-arquitetura)
- [3. Diário de experimentos](#3-diário-de-experimentos)
  - [E0. Levantamento da documentação](#e0-levantamento-da-documentação)
  - [E1. BigInt no compilador](#e1-bigint-no-compilador)
  - [E2. Sondagem do runtime no aparelho (v1)](#e2-sondagem-do-runtime-no-aparelho-v1)
  - [E3. Transporte de ponta a ponta](#e3-transporte-de-ponta-a-ponta)
  - [E4. AES/SHA/HMAC nativos, conforme a documentação (v1)](#e4-aesshahmac-nativos-conforme-a-documentação-v1)
  - [E5. Gerador de chaves do firmware como fonte de aleatoriedade (v1)](#e5-gerador-de-chaves-do-firmware-como-fonte-de-aleatoriedade-v1)
  - [E6. Diagnóstico exploratório (v2): reboot do relógio](#e6-diagnóstico-exploratório-v2-reboot-do-relógio)
  - [E7. Calibração com migalhas (v3): reboot identificado](#e7-calibração-com-migalhas-v3-reboot-identificado)
  - [E8. Análise do firmware do simulador](#e8-análise-do-firmware-do-simulador)
  - [E9. Criptografia em JS puro e JWE (v4): sucesso de ponta a ponta](#e9-criptografia-em-js-puro-e-jwe-v4-sucesso-de-ponta-a-ponta)
- [4. Resultados](#4-resultados)
  - [4.1 Capacidades do runtime do Bip 6](#41-capacidades-do-runtime-do-bip-6)
  - [4.2 API nativa de criptografia (@zos/crypto)](#42-api-nativa-de-criptografia-zoscrypto)
  - [4.3 Aleatoriedade (E5)](#43-aleatoriedade-e5)
  - [4.4 Transporte (E3)](#44-transporte-e3)
  - [4.5 Criptografia em JS puro (E9)](#45-criptografia-em-js-puro-e9)
  - [4.6 Situação das hipóteses da proposta](#46-situação-das-hipóteses-da-proposta)
  - [4.7 Resultado da Parte 1 do plano de testes](#47-resultado-da-parte-1-do-plano-de-testes)
- [5. Dificuldades, erros e lições](#5-dificuldades-erros-e-lições)
  - [5.1 Da plataforma](#51-da-plataforma)
  - [5.2 Do processo (erros cometidos)](#52-do-processo-erros-cometidos)
  - [5.3 Lições para as próximas fases](#53-lições-para-as-próximas-fases)
- [6. Próximos passos](#6-próximos-passos)
  - [6.0 Fechar a Fase 1](#60-fechar-a-fase-1)
  - [6.1 Fase 2: assinatura x402 em JS puro (H1, H2, H5)](#61-fase-2-assinatura-x402-em-js-puro-h1-h2-h5)
  - [6.2 Chave da carteira e entropia (H6, H7, RQ3)](#62-chave-da-carteira-e-entropia-h6-h7-rq3)
  - [6.3 Fase 3: pagamento x402 ponta a ponta (H3, H4, H8, H11)](#63-fase-3-pagamento-x402-ponta-a-ponta-h3-h4-h8-h11)
  - [6.4 Papel do canal JWE da Fase 1](#64-papel-do-canal-jwe-da-fase-1)
  - [6.5 O que saiu do plano](#65-o-que-saiu-do-plano)
  - [6.6 Perguntas abertas](#66-perguntas-abertas)
- [7. Como reproduzir](#7-como-reproduzir)
- [8. Evidências](#8-evidências)
- [Avisos](#avisos)

## Resumo dos achados

| Tema | Achado | Impacto na pesquisa |
|---|---|---|
| `BigInt` | **Ausente** no Bip 6. O `qjsc` (QuickJS 2020-07-05) que o Zeus distribui rejeita `1n`, e `typeof BigInt === 'undefined'` no aparelho | Confirma no Bip 6 a premissa da proposta: bibliotecas secp256k1 modernas (`@noble/*`) não servem; é preciso bignum com `Number` (ex.: `elliptic`/`bn.js`) |
| Runtime JS | ES2020 compila; `Promise` e `setTimeout` **existem**, ao contrário do que diz a doc; não há `TextEncoder`, `atob`/`btoa` nem `eval` | Corrige a seção 2.2 da proposta; UTF-8 e base64 precisam ser implementados |
| Crypto nativo (`@zos/crypto`) | `encrypt` de SHA-256, HMAC e AES devolve `undefined` com `Uint8Array`/`ArrayBuffer`; **AES com `number[]` reinicia o relógio**; o ECDSA nativo só aceita digest MD5 | Crypto nativo descartado. Toda a criptografia passa a ser JS puro |
| Aleatoriedade | `getRandomValues` não existe (API 5.0). **`createChiper()` gera chaves aleatórias**: 128 chaves sem repetição, χ² = 270,3 (z = 0,68), ~301 ms por chave | Fonte de entropia utilizável para gerar chave e IV (H7); a assinatura não precisa dela se usar RFC 6979 |
| JS puro | AES-128, SHA-256 e HMAC-SHA256 próprios, conferidos contra OpenSSL e `jose` (~1.150 casos aleatórios); KAT no relógio com vetores FIPS/NIST/RFC; **no relógio, cifrar um JWE de 43 bytes levou 143 ms** (3 blocos AES + 6 compressões SHA-256) e gerar o IV, 349 ms | HMAC-SHA256 é a base do RFC 6979; aritmética de 32 bits roda bem no runtime |
| Transporte | Relógio → BLE (ZML) → Side Service (Zepp/iOS) → HTTPS: ok, inclusive com mensagens de 4,8 KB fragmentadas; 189–1.238 ms do celular ao servidor e de volta | Infraestrutura pronta para as próximas fases (RQ2) |
| Modelo de ameaça | Em modo desenvolvedor, o app Zepp **registra em log todo payload BLE** do relógio | Evidência concreta para o adversário A1 e para a RQ4 |
| Robustez | Uma chamada nativa pode reiniciar o relógio inteiro. Foi criado um mecanismo de "migalhas" que identifica a chamada culpada no reboot seguinte e a bloqueia | Metodologia reaproveitável para testar APIs nativas sem repetir crashes |

Detalhes na seção [4. Resultados](#4-resultados) e dados brutos na seção [8. Evidências](#8-evidências).

## 1. Contexto e objetivo

### A pesquisa

O x402 reaproveita o código HTTP 402 (*Payment Required*) para que software pague por recursos web com stablecoins, sem conta nem chave de API. No esquema `exact` em redes EVM, o cliente não envia uma transação. Ele **assina uma autorização EIP-3009 (`transferWithAuthorization`) estruturada em EIP-712**, e um *facilitator* a transmite e liquida na blockchain. A segurança dos fundos do pagador depende de quem guarda a chave e decide o que assinar.

A pesquisa *"Assinatura de pagamentos x402 em um smartwatch: avaliação de um assinante vestível restrito"* inverte a premissa usual de que o cliente é um servidor ou um desktop com biblioteca criptográfica madura. Ela propõe que um **mini app do Zepp OS num Amazfit Bip 6**:

- guarde a chave privada, como uma hot wallet local;
- mostre valor e destinatário e aplique uma política de gastos;
- calcule **no próprio relógio** o hash EIP-712 e a assinatura **ECDSA secp256k1 (RFC 6979)** da autorização;

enquanto o **iPhone apenas transporta mensagens** (BLE e HTTP) e um servidor de recursos e um facilitator verificam e liquidam o pagamento na Base Sepolia.

A proposta identifica três restrições:

1. criptografia de curva elíptica num **runtime JavaScript interpretado, aparentemente sem `BigInt`**;
2. **proteção da chave sem elemento seguro** acessível ao app;
3. **coordenação síncrona de quatro sistemas** dentro de janelas de validade de poucos segundos.

Ela formula quatro perguntas de pesquisa (RQ1–RQ4) e doze hipóteses (H1–H12).

### O papel deste repositório

Na proposta, o procedimento experimental começa pela **sondagem do runtime** (etapa 1). O motivo é resolver primeiro a maior incerteza com o menor esforço: se o relógio não conseguir fazer criptografia, o projeto muda antes de qualquer trabalho de interface ou servidor.

Este repositório cumpre essa função e vai um pouco além. Ele:

1. **mede as capacidades reais** do runtime do Bip 6 (`BigInt`, `Promise`, APIs de texto, módulo nativo de criptografia, fonte de aleatoriedade);
2. **testa criptografia moderna no relógio**, começando pela simétrica (AES + HMAC), que é a mais simples e cujas primitivas (SHA-256, HMAC-SHA256) também serão usadas pelo RFC 6979 na assinatura ECDSA;
3. **monta e valida a infraestrutura de ponta a ponta**: relógio → BLE → Side Service no app Zepp → HTTPS → servidor, com relatórios estruturados e conferência automática no servidor;
4. **cria a metodologia de teste** para um dispositivo em que algumas chamadas nativas derrubam o sistema: migalhas, vetores conhecidos (KAT) e simulação local do código do relógio.

### O plano inicial e como ele evoluiu

O plano inicial dividia os testes em três partes, da mais simples para a mais complexa, a ser executadas uma por vez:

| Parte | Plano original | O que aconteceu |
|---|---|---|
| 1 | AES com a API nativa `@zos/crypto` | A API nativa se mostrou inutilizável no Bip 6 (ver [experimentos](#3-diário-de-experimentos)). A Parte 1 foi concluída com **AES-128-CBC + HMAC-SHA256 em JS puro**, no formato padrão **JWE**, e o servidor decifrou a mensagem do relógio. |
| 2 | ECDSA com a API nativa (secp256k1) | A API nativa só aceita digest MD5, incompatível com EIP-712 (Keccak-256), e o restante do módulo não funciona no aparelho. A Parte 2 passa a ser **secp256k1 + RFC 6979 + Keccak-256 + EIP-712 em JS puro**: o núcleo da hipótese H1. |
| 3 | RSA em JS puro (bignum sem `BigInt`) | **Retirada do caminho crítico.** O x402 em EVM não usa RSA. A Parte 3 passa a ser o **pagamento x402 ponta a ponta** na Base Sepolia (etapas 4–6 da proposta). |

Detalhes em [Próximos passos](#6-próximos-passos).

### Correção de premissas do enunciado original

Ao começar, o pedido de teste continha três confusões conceituais, corrigidas antes da implementação e registradas aqui porque ajudam quem lê o código:

- **AES é simétrico** (uma única chave compartilhada), não assimétrico.
- **RSA é assimétrico** (par de chaves pública e privada), não simétrico.
- **ECDSA é assinatura, não cifragem.** Ele prova autoria e integridade, mas não esconde o conteúdo. Para cifrar com curva elíptica usa-se ECDH/ECIES. **No x402, o que importa é exatamente a assinatura**, não a cifragem.

### Relação com as perguntas de pesquisa

| Pergunta / hipótese | Contribuição desta fase |
|---|---|
| **RQ1 / H1** (viabilidade sem `BigInt`) | Confirma a ausência de `BigInt` no Bip 6 e mostra que primitivas de 32 bits (SHA-256, HMAC, AES) rodam corretamente no runtime. Ainda **não** testa secp256k1. |
| **RQ2** (decomposição de latência) | Primeiras medições do trecho celular → servidor e da fragmentação BLE; infraestrutura de relatórios pronta. |
| **RQ3 / H7** (garantias sem hardware seguro; entropia) | Encontra uma fonte de entropia no firmware (`createChiper`) e documenta que as operações nativas de cifra e hash não funcionam no Bip 6. O `encryptKey` (AES com chave de hardware/PUF), candidato a proteger a chave em repouso, **ainda não foi testado**. |
| **RQ4 / H8** (o que o celular consegue fazer) | Observa que o app Zepp, em modo desenvolvedor, registra em log todo payload BLE do relógio. O celular vê tudo o que o relógio envia. |

## 2. Arquitetura

### Componentes

```
┌──────────────────────────┐   BLE (ZML/MessageBuilder)   ┌─────────────────────────────┐   HTTPS (fetch)   ┌──────────────────────────┐
│ Relógio: Amazfit Bip 6   │ ───────────────────────────▶ │ iPhone: app Zepp            │ ───────────────▶ │ Servidor (Vercel)        │
│ Device App (QuickJS)     │ ◀─────────────────────────── │ Side Service + Settings App │ ◀─────────────── │ smartwatch-x402-events   │
│                          │   JSON-RPC, até ~3,5 KB/frame│                             │   JSON            │                          │
│ • testes e UI            │                              │ • só repassa                │                   │ • decifra o JWE          │
│ • AES/SHA/HMAC/JWE em JS │                              │ • não conhece chaves        │                   │ • confere KAT e RNG      │
│ • keygen nativo (RNG)    │                              │ • loga tudo (modo dev)      │                   │ • responde ao relógio    │
│ • migalhas anti-crash    │                              │                             │                   │                          │
└──────────────────────────┘                              └─────────────────────────────┘                   └──────────────────────────┘
```

É a mesma divisão de papéis da proposta x402. **O relógio é a única parte que conhece a chave e faz a criptografia.** O celular é transporte e não precisa ser confiável para a integridade da mensagem. O servidor verifica.

#### Device App (relógio)

- `page/index.js`: tela com quatro botões. Cada um executa um teste de forma síncrona, mostra um resumo na tela, registra o relatório completo no log (visível no `zeus bridge`) e envia o relatório ao celular com `this.request({ method: 'forward', ... })` da biblioteca ZML. Ao abrir, a página verifica se o teste anterior derrubou o relógio (ver *Migalhas*).
- `utils/phase1-tests.js`: os testes.
  - **Sondagem:** capacidades do runtime, sem identificadores do aparelho.
  - **KAT:** vetores conhecidos e tempos.
  - **RNG:** 64 chaves do firmware.
  - **Enviar msg:** JWE com IV aleatório.
- `utils/zcrypto.js`: o **único** uso do `@zos/crypto`, que é gerar chaves com `createChiper()`. Nenhuma operação nativa de cifra ou hash é chamada.
- `shared/*.js`: primitivas em JS puro (AES-128-CBC, SHA-256, HMAC-SHA256, JWE, codificações). São compartilhadas com os testes em Node.

#### Side Service e Settings App (celular)

- `app-side/index.js`: recebe `{ kind, payload }` do relógio, registra no log e faz `POST` na URL configurada, com o cabeçalho `Title: zepp-<kind>`. Devolve ao relógio o status e o corpo da resposta. **Não tem chaves.**
- `setting/index.js`: campo para a URL do servidor, gravada no `settingsStorage`.

#### Servidor

Repositório `smartwatch-x402-events`, função serverless na Vercel:

- `api/index.js`: registra a requisição. Quando o corpo traz `kind`, chama `handle()`.
- `lib/aes-reference.cjs`: cópia de `tools/aes-reference.cjs` deste repositório. Usa só o módulo `crypto` do Node:
  - `openJwe`: confere a tag **antes** de decifrar, com comparação em tempo constante;
  - `analyzeKat`: lista os vetores que falharam e os tempos;
  - `analyzeRng`: repetições, χ² dos bytes e proporção de bits 1.

### Formato da mensagem: JWE compacto `dir` + `A128CBC-HS256`

Formato padrão, definido pela RFC 7516 (JWE) e pela RFC 7518 §5.2.2. Qualquer biblioteca JOSE decifra; o teste local confere isso com a biblioteca `jose`.

```
K (32 bytes, pré-compartilhada) = MAC_KEY (16) || ENC_KEY (16)

cabeçalho  = {"alg":"dir","enc":"A128CBC-HS256","kid":"test-1"}
AAD        = ASCII(BASE64URL(cabeçalho))
IV         = 16 bytes aleatórios (keygen do firmware → SHA-256)
E          = AES-128-CBC(ENC_KEY, IV, PKCS7(mensagem UTF-8))
T          = HMAC-SHA256(MAC_KEY, AAD || IV || E || AL)[0..16]    AL = bits de AAD, 64 bits big-endian

token      = BASE64URL(cabeçalho) . "" . BASE64URL(IV) . BASE64URL(E) . BASE64URL(T)
```

É encrypt-then-MAC com IV aleatório por mensagem e cabeçalho autenticado. O servidor rejeita qualquer bit alterado no cabeçalho, no IV, no ciphertext ou na tag.

O relógio envia ao celular:

```json
{ "jwe": "eyJhbGciOiJkaXIi...", "rng": "aes-keygen+sha256", "rng_ms": 349, "seal_ms": 143 }
```

e o servidor responde:

```json
{ "ok": true, "kind": "aes.msg", "plaintext": "Olá do Bip 6! ação ✓ #1 @1795211549696", "bytes": 43, "kid": "test-1", ... }
```

> Valores reais do teste final no Bip 6, em 20 nov. 2026 (ver [`evidencias/05-teste-final-jwe.json`](docs/evidencias/05-teste-final-jwe.json)).

### Aleatoriedade

O Bip 6 está no API_LEVEL 4.2 e o `getRandomValues` só existe a partir do 5.0. Por isso, cada bloco de 16 bytes aleatórios é calculado assim:

```
SHA-256( createChiper() || contador || Date.now() )[0..16]
```

- O `createChiper()` de uma instância AES **sem chave importada** devolve uma chave nova gerada pelo firmware, a única operação nativa que funcionou.
- O SHA-256 é o nosso, então o "branqueamento" não depende do nativo.
- Se o keygen falhar ou for bloqueado, o app cai para `Math.random` e **marca a fonte como `math-random-INSEGURO`** no relatório, para que isso nunca passe despercebido.

### Migalhas contra crash (`utils/crumbs.js`)

Algumas chamadas nativas com argumentos inesperados reiniciam o relógio inteiro, e `try/catch` não ajuda. O mecanismo:

1. Antes de cada chamada nativa, grava o nome dela (ex.: `aes.keygen.createChiper`) no arquivo `crypto_crumb.txt` (`@zos/fs`).
2. Ao terminar o teste sem crash, apaga a migalha.
3. Ao abrir a página, se a migalha ainda existe, **a última chamada derrubou o relógio**. O nome vai para `crypto_blocked.json` e a chamada nunca mais é executada. A tela avisa o usuário.

No experimento E7 a migalha sobreviveu ao reboot e identificou a chamada `aes.encrypt.arr`, e a calibração seguinte rodou sem novo crash.

### Testes locais

| Comando | O que faz |
|---|---|
| `npm run selftest` | Compara `shared/` com o OpenSSL (`node:crypto`) e com a biblioteca `jose` em casos aleatórios e vetores oficiais; testa a rejeição de adulteração no servidor |
| `npm run devicesim` | Executa o **código real do relógio** (`utils/` + `shared/`) no Node, com `@zos/crypto`, `@zos/fs`, `@zos/device` e `@zos/settings` simulados como o Bip 6 se comportou. Exige **zero** chamadas a `encrypt`/`digest` nativos e simula um reboot para testar as migalhas |
| `npm run decode -- <arquivo>` | Decifra/analisa localmente um relatório copiado do log do app-side |

O build (`zeus build`) passa cada arquivo pelo `qjsc`, o mesmo compilador QuickJS usado no relógio. Isso funciona também como verificação de sintaxe do runtime.

### Mapa do código

| Arquivo | Conteúdo |
|---|---|
| `shared/aes.js` | S-box gerada em GF(2⁸), expansão de chave, `encryptBlock`/`decryptBlock`, CBC + PKCS#7 |
| `shared/sha256.js` | SHA-256 (FIPS 180-4) com inteiros de 32 bits; HMAC (RFC 2104) |
| `shared/jwe.js` | `sealJwe` / `openJwe` |
| `shared/config.js` | Chave de teste e vetores KAT, com a origem de cada um |
| `utils/zcrypto.js` | Achados sobre o `@zos/crypto` documentados no cabeçalho; keygen e RNG |
| `utils/crumbs.js` | Migalhas |
| `tools/aes-reference.cjs` | Referência do servidor |
| `tools/mocks/zos-crypto.mjs` | O comportamento observado do `@zos/crypto`, codificado como mock |

## 3. Diário de experimentos

Os experimentos estão em ordem cronológica e foram feitos em 19 e 20 nov. 2026. Cada um registra o objetivo, o método, o resultado e a evidência. As versões do app citadas (v1–v4) correspondem a iterações sucessivas do mini app instalado no relógio pelo `zeus bridge`.

**Ambiente:**

| Item | Valor |
|---|---|
| Relógio | Amazfit Bip 6, Zepp OS 5, firmware 4.6.0.3, API_LEVEL 4.2 |
| Celular | iPhone com iOS 26.6.1 e app Zepp 10.10.5 em modo desenvolvedor |
| Desenvolvimento | Zeus CLI 1.10.1 (zpm 3.5.0, `qjsc` QuickJS 2020-07-05), Node.js 24, Linux |
| Servidor | Vercel (Node), repositório `smartwatch-x402-events` |

---

### E0. Levantamento da documentação

**Objetivo:** saber o que o Zepp OS oferece antes de escrever código.

**Achados:**

- A documentação do Device App lista o módulo **`@zos/crypto`** (API_LEVEL 3.0) com:
  - AES-CBC (só chave de 128 bits; entrada múltipla de 16 bytes; **o IV não é documentado**);
  - ECDSA nas curvas secp192k1/224k1/256k1, mas com **digest só MD5/HMAC-MD5**;
  - MD5/SHA-1/SHA-256 e HMAC;
  - `encryptKey`, que cifra com uma chave de hardware (PUF);
  - `getRandomValues`, que **exige API_LEVEL 5.0**.
- O pacote de tipos `@zeppos/device-types` (3.0.1 e 4.0.0) **não declara** `@zos/crypto`. Os tipos foram escritos à mão a partir da doc em `types/zos-crypto.d.ts`.
- A página "JavaScript Support" diz que o runtime segue ES6 e que **`Promise`, geradores e timers não são suportados**. A sondagem (E2) desmentiu isso para `Promise` e `setTimeout`.
- Não foi encontrado nenhum projeto público que use `@zos/crypto`.

### E1. `BigInt` no compilador

**Objetivo:** confirmar a premissa de que não há `BigInt`, sem depender do aparelho.

**Método:** o Zeus CLI traz o `qjsc` que compila o código do relógio para bytecode QuickJS. Compilamos trechos de teste com ele.

**Resultado:**

- Versão `QuickJS Compiler version 2020-07-05`.
- `var a = 1n` falha com **`SyntaxError: invalid number literal`**, e `qjsc -fbignum` responde **`unsupported feature: bignum`**. O binário foi compilado sem `CONFIG_BIGNUM`.
- Sintaxe ES2020 (`**`, `?.`, `??`, `async/await`, spread de objeto, campos de classe, geradores) compila normalmente.

**Evidência:** [`evidencias/01-sondagem-runtime.json`](docs/evidencias/01-sondagem-runtime.json), seção `compilador_qjsc`.

### E2. Sondagem do runtime no aparelho (v1)

**Objetivo:** tabela de capacidades do Bip 6 (etapa 1 da proposta).

**Método:** botão **1 · Sondagem**. Registra `typeof` de várias APIs globais, `getSystemInfo()`, os exports do `@zos/crypto` e a fonte de aleatoriedade escolhida.

**Resultado:**

- `BigInt`: `undefined`. Confirmado no aparelho.
- `Promise`, `setTimeout`, `Proxy`, `WeakMap`, `Symbol`, `Math.imul`, `Uint8Array` e `DataView`: todos `function`.
- `TextEncoder`, `TextDecoder`, `atob`, `btoa` e `eval`: todos `undefined`.
- Exports do `@zos/crypto`: `checkAvailable`, `createCrypto`, `encryptKey`, `alg`, `digest`, `ecp_dp`, `default`. Dois deles (`checkAvailable`, `digest`) não aparecem na documentação.
- `Object.keys(alg)` devolve `[]`, mas `alg.AES_CBC` existe: as constantes não são enumeráveis.

**Evidência:** [`evidencias/01-sondagem-runtime.json`](docs/evidencias/01-sondagem-runtime.json).

### E3. Transporte de ponta a ponta

**Objetivo:** validar relógio → BLE → Side Service → HTTPS → servidor → resposta na tela.

**Método:**

- ZML (`@zeppos/zml`) no relógio e no Side Service;
- `fetch` no Side Service, com a URL definida no Settings App;
- servidor na Vercel respondendo um JSON de análise.

**Resultado:** funcionou desde a primeira versão. Detalhes:

- **Mensagens grandes são fragmentadas pela ZML.** Um relatório de 4.806 bytes foi enviado em dois frames, de 3.600 e 1.370 bytes. O payload útil por frame é de 3.584 bytes.
- **Tempo do Side Service até o servidor e de volta:** 479 ms na primeira requisição da sessão, depois 215 ms e 189 ms. A função da Vercel rodou em `iad1` (EUA), com borda em `gru1` (São Paulo).
- O app Zepp **registra em log, em hexadecimal e texto, cada frame BLE recebido do relógio** e cada corpo HTTP enviado. O código do Side Service é baixado e executado dentro do app Zepp.
- O agendador do app Zepp registra para o processo do Side Service um `estimatedIdleTime` de 10 minutos após o último uso. É um indício do ciclo de vida em segundo plano, relevante para a H11.

**Evidência:** [`evidencias/04-transporte-e-servidor.json`](docs/evidencias/04-transporte-e-servidor.json).

### E4. AES/SHA/HMAC nativos, conforme a documentação (v1)

**Objetivo:** cifrar com AES-128-CBC nativo e descobrir o comportamento não documentado: IV, padding e efeito do `key_encrypt`.

**Método:** botão **2 · AES KAT**, com sete testes de AES (t1 a t7) e vetores de SHA-256 e HMAC, todos com `Uint8Array`, como no exemplo de AES da documentação. O servidor deduziria o IV por `IV = AES-ECB⁻¹(C₁) ⊕ P₁`.

**Resultado:** **todas as chamadas `encrypt()` devolveram `undefined`**: SHA-256, HMAC e os sete testes de AES. O `createCrypto()` funcionou, devolvendo instâncias. A mensagem real (botão 4) falhou porque o SHA-256 usado no RNG falhou.

**Evidência:** [`evidencias/02-crypto-nativo.json`](docs/evidencias/02-crypto-nativo.json), evento v1.

### E5. Gerador de chaves do firmware como fonte de aleatoriedade (v1)

**Objetivo:** avaliar `createChiper()`, que gera uma chave AES, como substituto do `getRandomValues`.

**Método:** botão **3 · RNG**, com 64 chaves de 16 bytes por execução. O servidor calcula repetições, χ² dos 256 valores de byte (255 graus de liberdade) e proporção de bits 1. Foram duas execuções.

**Resultado:**

| Execução | Chaves | Repetidas | χ² | z | Bits 1 | Tempo |
|---|---|---|---|---|---|---|
| 1 | 64 | 0 | 280,5 | 1,13 | 0,5115 | 19.272 ms |
| 2 | 64 | 0 | 250,0 | −0,22 | 0,4974 | 19.346 ms |
| Juntas | 128 | 0 | 270,3 | 0,68 | 0,5045 | ~301 ms/chave |

Nenhuma anomalia grosseira. A amostra é pequena e **não prova qualidade criptográfica**. Um bloco aleatório de 16 bytes custa ~300 ms no relógio.

**Evidência:** [`evidencias/03-rng-createChiper.json`](docs/evidencias/03-rng-createChiper.json), com as amostras brutas. As estatísticas recalculadas a partir delas batem exatamente com as do servidor.

### E6. Diagnóstico exploratório (v2): reboot do relógio

**Objetivo:** descobrir o formato que o firmware espera, testando sistematicamente variantes.

**Método:** um botão de diagnóstico que testava:

- formatos de entrada (`Uint8Array`, `ArrayBuffer`, `number[]`);
- opções de criação;
- leitura de vários campos de resultado;
- **funções não documentadas**: `checkAvailable()`, `digest()` e o algoritmo `AES_ECB`, visto no firmware.

**Resultado:** **o relógio inteiro reiniciou.** Como essa versão não gravava o progresso fora da memória, não foi possível saber qual chamada causou o reboot.

**Lição:** chamadas nativas com argumentos inesperados podem derrubar o sistema operacional do relógio, não só o app. Isso motivou o mecanismo de migalhas e a regra de **nunca chamar funções não documentadas** sem proteção.

### E7. Calibração com migalhas (v3): reboot identificado

**Objetivo:** repetir a busca de formatos, agora só com a API documentada, ordenando dos formatos mais seguros para os menos testados e protegendo cada chamada nativa com uma migalha gravada em arquivo.

**Resultado:**

1. A primeira execução **reiniciou o relógio de novo**.
2. Ao reabrir o app, **a migalha estava lá: `aes.encrypt.arr`**, ou seja, `AES_CBC.encrypt()` com a entrada em `number[]`. A tela mostrou o aviso e a chamada foi bloqueada.
3. A calibração seguinte rodou **sem novo crash** e mostrou que:
   - SHA-256 e HMAC devolvem `undefined` com `Uint8Array` e `ArrayBuffer`, em todas as opções e formatos de chave;
   - no AES, `createChiper()` numa instância criada com `private_key` **ignora a chave informada e devolve outra chave aleatória**; com a chave em `number[]` devolve `undefined`;
   - mesmo com `key_encrypt: 1` e `createChiper()`, que é o fluxo do exemplo da documentação, `encrypt()` continua `undefined`.

**Conclusão:** no Bip 6 (fw 4.6.0.3), as operações de cifra e hash do `@zos/crypto` **não são utilizáveis** por um mini app. A única operação que funciona é a geração de chave.

**Evidência:** [`evidencias/02-crypto-nativo.json`](docs/evidencias/02-crypto-nativo.json), eventos v3.

### E8. Análise do firmware do simulador

**Objetivo:** entender o módulo nativo sem arriscar o aparelho.

**Método:** o simulador oficial baixa um firmware ARM com símbolos de debug (`main.elf`). Analisamos suas strings e sua tabela de símbolos com `strings` e `readelf`.

**Resultado:**

- O módulo `js_crypto_module.c` registra mais algoritmos do que a doc: `AES_ECB`, `AES_CFB`, `3DES`, `CRC16/32` e constantes internas de RSA/DES.
- As constantes usam `JS_PROP_CONFIGURABLE`, ou seja, não são enumeráveis.
- **A implementação de cada algoritmo não está no firmware do emulador**, só o esqueleto do módulo e o mbedTLS. Por isso o simulador não serve para testar criptografia nativa.

### E9. Criptografia em JS puro e JWE (v4): sucesso de ponta a ponta

**Objetivo:** concluir a Parte 1 sem depender do nativo.

**Método:**

- AES-128-CBC, SHA-256 e HMAC-SHA256 implementados em JS puro (`shared/`), só com inteiros de 32 bits.
- Mensagem no formato **JWE compacto `dir` + `A128CBC-HS256`**, com IV de 16 bytes vindo do keygen do firmware passado pelo SHA-256.
- **Validação antes de ir ao aparelho:**
  - ~1.150 casos aleatórios comparados com o OpenSSL;
  - vetores FIPS-197, NIST SP 800-38A, FIPS 180-2 e RFC 4231;
  - interoperabilidade nos dois sentidos com a biblioteca `jose`;
  - simulação do código do relógio com o `@zos/crypto` se comportando como no E7;
  - `zeus build` compilando tudo com o `qjsc`.
- **No relógio:** o botão **2 · KAT** recalcula os vetores oficiais e um token JWE de referência (gerado pelo OpenSSL e aceito pelo `jose`) e mede os tempos. O botão **4 · Enviar msg** cifra uma mensagem UTF-8 com acentos e o caractere "✓", e o servidor decifra.

**Resultado:** **o servidor recebeu o JWE gerado no relógio e o decifrou com sucesso** (19 e 20 nov. 2026). Nenhuma operação nativa de cifra ou hash foi chamada; a simulação exige zero chamadas e o bytecode foi conferido.

Teste registrado em 20 nov. 2026, 21:52 UTC:

| Medida | Valor |
|---|---|
| Texto decifrado pelo servidor | `Olá do Bip 6! ação ✓ #1 @1795211549696` (43 bytes UTF-8) |
| Conferência independente | o mesmo token decifra com `npm run decode` e com a biblioteca `jose` |
| Cifrar no relógio (`seal_ms`) | **143 ms**: 3 blocos AES-128-CBC + HMAC-SHA256 de 139 bytes (6 compressões SHA-256) + codificações |
| Gerar o IV (`rng_ms`) | **349 ms**: 1 chave do firmware (~301 ms no E5) + 1 compressão SHA-256 |
| Frames BLE | 403 bytes (relógio → celular) e 339 bytes (resposta) |
| Side Service → servidor → Side Service | 1.238 ms (primeira requisição após ~1 dia sem uso da função) |
| Criação da mensagem → chegada no celular | ≈ 1,5 s, com relógios **não sincronizados**; inclui ~0,5 s de criptografia e a abertura do Side Service pelo app Zepp (`peerAppLaunched`) |

São valores de **uma única execução**.

**Pendente:** registrar o resultado do botão **2 · KAT** da v4 (vetores e tempos por primitiva) e repetir o envio várias vezes para ter mediana e p95. O KAT separa o custo de cada primitiva em JS puro no Bip 6 (ver [resultados](#4-resultados)).

## 4. Resultados

Resultados consolidados da Fase 1, com o experimento de origem entre parênteses (ver o [diário](#3-diário-de-experimentos)). Os dados brutos estão em [`evidencias/`](docs/evidencias/).

### 4.1 Capacidades do runtime do Bip 6

| Recurso | Bip 6 (fw 4.6.0.3, API 4.2) | Documentação Zepp OS | Fonte |
|---|---|---|---|
| `BigInt` | **Ausente** no compilador (`qjsc` sem `CONFIG_BIGNUM`) e no runtime | não citado | E1, E2 |
| Sintaxe ES2020 (`?.`, `??`, `**`, `async`, classes) | compila | "ES6" | E1 |
| `Promise` | **existe** | "não suportado" | E2 |
| `setTimeout` | **existe** | "não suportado" | E2 |
| `TextEncoder` / `TextDecoder` | ausentes | não citado | E2 |
| `atob` / `btoa` | ausentes | não citado | E2 |
| `eval` | ausente | proibido | E2 |
| `Uint8Array`, `DataView`, `Proxy`, `WeakMap`, `Symbol`, `Math.imul` | presentes | não citado | E2 |
| `@zos/crypto` | presente, com 2 exports não documentados (`checkAvailable`, `digest`) e constantes não enumeráveis | AES-CBC, ECDSA, digests, `encryptKey`, `getRandomValues` | E0, E2, E8 |
| `getRandomValues` | ausente | API_LEVEL 5.0 | E0, E2 |

**Implicação para a proposta (seção 2.2):** a ausência de `BigInt` está **confirmada no Bip 6**, e não apenas no modelo citado em [35]. Já a afirmação de que `Promise` e timers não existem **não vale** para este aparelho. A biblioteca oficial de mensagens (ZML) depende de ambos.

### 4.2 API nativa de criptografia (`@zos/crypto`)

| Operação | Uint8Array | ArrayBuffer | number[] | Fonte |
|---|---|---|---|---|
| `createCrypto(AES_CBC / SHA_256 / HMAC_SHA_256)` | instância | instância | instância | E4, E7 |
| `createChiper()` sem chave importada | **chave aleatória (funciona)** | — | — | E5 |
| `createChiper()` com `private_key` | **outra** chave aleatória | outra chave aleatória | `undefined` | E7 |
| `SHA_256.encrypt` | `undefined` | `undefined` | sem crash, resultado não registrado | E4, E7 |
| `HMAC_SHA_256.encrypt` | `undefined` | `undefined` | sem crash, resultado não registrado | E4, E7 |
| `AES_CBC.encrypt` (com ou sem `createChiper`, `key_encrypt` 0 ou 1) | `undefined` | `undefined` | **reinicia o relógio** | E4, E7 |
| `ECDSA` | não testado: a doc só aceita digest MD5/HMAC-MD5, incompatível com EIP-712 | | | E0 |
| `encryptKey` (PUF) | não testado | | | — |
| `checkAvailable()`, `digest()` (não documentados) | provável causa do reboot do E6, não confirmada | | | E6 |

**Conclusão:** a API nativa **não serve** para a pesquisa no Bip 6 atual. Mesmo que funcionasse, o ECDSA nativo assina digest MD5 e não produziria assinaturas válidas para EIP-712/EIP-3009. **Toda a criptografia passa a ser feita em JavaScript puro.**

### 4.3 Aleatoriedade (E5)

| Medida | Valor |
|---|---|
| Fonte | `createCrypto(AES_CBC, {key_bit_length:128, key_encrypt:0}).createChiper()` |
| Amostras | 128 chaves × 16 bytes (2 execuções) |
| Chaves repetidas | 0 |
| χ² dos bytes (255 g.l.) | 270,3 (z = 0,68) |
| Proporção de bits 1 | 0,5045 |
| Custo | ~301 ms por chave (19,3 s para 64) |

Não há anomalias grosseiras. Um IV de 16 bytes custa ~0,3 s. A assinatura ECDSA com RFC 6979 **não precisa** de aleatoriedade, mas a geração da chave da carteira e o nonce do EIP-3009 (32 bytes) podem usar essa fonte, combinada com outras (H7).

### 4.4 Transporte (E3)

| Medida | Valor |
|---|---|
| Payload útil por frame BLE (ZML) | 3.584 bytes; maior frame observado: 3.600 bytes |
| Mensagem fragmentada | 4.806 bytes em 2 frames, entregue íntegra |
| Side Service → servidor → Side Service | 479 ms (1ª da sessão), 215 ms, 189 ms (19 nov.); 1.238 ms (20 nov., 1ª requisição após ~1 dia sem uso) |
| Criação da mensagem no relógio → chegada no celular | ≈ 1,5 s (1 amostra, relógios não sincronizados; inclui ~0,5 s de criptografia e a abertura do Side Service) |
| Região da função | `iad1` (EUA), borda `gru1` (São Paulo) |

As medições ainda são poucas e foram feitas sem instrumentação de carimbos de tempo no relógio. A decomposição da latência (RQ2) será medida com rigor nas próximas fases. Para isso, a função do servidor deve ser fixada numa região próxima.

### 4.5 Criptografia em JS puro (E9)

**Validação local** (`npm test`):

| Primitiva | Referência | Casos |
|---|---|---|
| SHA-256 | OpenSSL | 301 tamanhos (0–300 bytes) + 100 KB |
| HMAC-SHA256 | OpenSSL | chaves de 0–150 bytes (inclui > 64) |
| AES-128 (bloco, cifrar e decifrar) | OpenSSL | 500 chaves/blocos aleatórios |
| AES-128-CBC + PKCS#7 | OpenSSL | 0–200 bytes, nos dois sentidos |
| Vetores oficiais | FIPS-197, SP 800-38A F.2.1, FIPS 180-2, RFC 4231 | todos |
| JWE `dir` + `A128CBC-HS256` | biblioteca `jose` 6.2.18 | nos dois sentidos, 0–120 caracteres UTF-8 |
| Rejeição de adulteração | servidor de referência | bit trocado no cabeçalho, IV, ciphertext ou tag; chave errada; `alg`/`enc` trocados; `kid` errado; formato quebrado |
| Código do relógio simulado | mocks do `@zos/*` | zero chamadas a `encrypt`/`digest` nativos; reboot simulado e recuperação pela migalha |

**No aparelho:**

| Medida | Resultado |
|---|---|
| Mensagem JWE do relógio decifrada pelo servidor | **sucesso** (19 e 20 nov.); o token de 20 nov. também decifra com `jose` |
| KAT no relógio (AES bloco, CBC, SHA-256, HMAC, JWE) | **a registrar** |
| AES-128-CBC 1 KB (ms) | **a registrar** |
| SHA-256 1 KB (ms) | **a registrar** |
| HMAC-SHA256 1 KB (ms) | **a registrar** |
| JWE de 100 bytes (ms) | **a registrar** |
| **Cifrar o JWE de 43 bytes** (`seal_ms`: 3 blocos AES + 6 compressões SHA-256 + codificações) | **143 ms** (1 amostra) |
| **Gerar o IV** (`rng_ms`: keygen do firmware + 1 compressão SHA-256) | **349 ms** (1 amostra) |

> Para preencher: rodar **2 · KAT** e **4 · Enviar msg** na v4 e copiar o JSON do log do `zeus bridge` (linhas `[aes.kat]` e `[aes.msg]`) ou da resposta do servidor. Como o relógio mede só 5 repetições, o tempo do SHA-256 por bloco de 64 bytes servirá de primeira estimativa do custo do Keccak-256, que também usa só operações de 32 bits.

### 4.6 Situação das hipóteses da proposta

A Fase 1 não testa nenhuma hipótese diretamente: a assinatura ECDSA é a Fase 2. Ela produz evidências preliminares para algumas:

| Hipótese | Situação após a Fase 1 |
|---|---|
| **H1. Viabilidade** sem `BigInt` | Premissa confirmada (sem `BigInt`). Aritmética de 32 bits correta no runtime (SHA-256/HMAC/AES). **secp256k1 ainda não testado.** |
| **H2. Custo da assinatura** | Primeira referência de velocidade do runtime: 143 ms para 6 compressões SHA-256 + 3 blocos AES (1 amostra). O custo por primitiva (KAT) ainda falta. secp256k1 não testado. |
| **H5. Conferência barata** (EIP-712) | Sem dados. O SHA-256 em JS servirá de base para estimar o Keccak-256. |
| **H7. Entropia** | Evidência favorável: `createChiper()` fornece bytes sem anomalia grosseira (128 amostras). Falta estimar a entropia mínima e combinar com outras fontes. |
| **H8. Canal só nega serviço** | Observação relevante: o app Zepp vê e registra tudo. A integridade dependerá só da assinatura e da conferência no relógio. |
| **H11. Estado do app no iOS** | Observação: o agendador do app Zepp marca o Side Service como ocioso 10 min após o último uso. |
| H3, H4, H6, H9, H10, H12 | Fora do escopo desta fase. |

### 4.7 Resultado da Parte 1 do plano de testes

| Critério | Status |
|---|---|
| Relógio cifra uma mensagem com chave simétrica | ✅ AES-128-CBC + HMAC-SHA256 em JS puro (JWE) |
| Mensagem transportada pelo app Zepp até o servidor | ✅ |
| Servidor decifra e confere a integridade | ✅ |
| Adulteração rejeitada | ✅ (testado localmente e contra o servidor em produção) |
| Usar a API nativa do relógio | ❌ inviável no Bip 6 fw 4.6.0.3 (ver 4.2) |
| Tempos medidos no relógio | ◐ parcial: cifrar 143 ms e IV 349 ms (1 amostra); custo por primitiva (KAT) pendente |

## 5. Dificuldades, erros e lições

Registro honesto do que deu errado e do que mudou por causa disso. Vários desses pontos são resultados por si só, porque descrevem a plataforma, e não apenas o processo.

### 5.1 Da plataforma

#### A documentação não corresponde ao aparelho

- A página de suporte a JavaScript diz que `Promise` e timers não existem. No Bip 6 os dois existem, e a própria biblioteca oficial de mensagens (ZML) depende deles.
- O `@zos/crypto` está documentado com exemplos, mas no Bip 6 (fw 4.6.0.3) suas operações devolvem `undefined`. O pacote de tipos oficial nem declara o módulo.
- O módulo exporta duas funções que não aparecem na documentação (`checkAvailable`, `digest`), e as constantes de algoritmo não são enumeráveis. Uma inspeção ingênua (`Object.keys`) conclui erroneamente que elas não existem.

**Lição:** para esta pesquisa, a documentação do Zepp OS é hipótese, não fato. Toda premissa sobre o runtime precisa de um teste no aparelho, e a seção 2.2 da proposta deve citar as medições deste repositório.

#### Chamadas nativas podem reiniciar o relógio inteiro

Com o argumento errado (`number[]` no `AES_CBC.encrypt`), a chamada **reinicia o sistema operacional do relógio**: não lança exceção nem fecha só o app. Isso aconteceu duas vezes (E6 e E7).

Consequências:

- Para a pesquisa, o binding nativo não valida a entrada antes de usá-la. Qualquer mini app pode derrubar o relógio, o que também é uma observação de robustez e segurança da plataforma.
- Para a metodologia, testes exploratórios de API nativa precisam de proteção contra crash. Daí o mecanismo de **migalhas** (`utils/crumbs.js`): grava o nome da chamada antes de executá-la e, no próximo boot, identifica e bloqueia a culpada. Funcionou na primeira vez em que foi necessário (E7).

#### O simulador não serve para criptografia nativa

O firmware que o simulador executa contém só o esqueleto do módulo `@zos/crypto`, sem as implementações (E8). Somado aos relatos de que o simulador não executa o Side Service (referência [39] da proposta), isso faz com que **todo teste relevante precise ser feito no aparelho**. O ciclo fica lento: instalar pelo `zeus bridge`, tocar nos botões e copiar logs.

**Mitigação:** quase toda a lógica fica em código puro (`shared/`), testado no Node contra OpenSSL e `jose` antes de ir ao relógio, e o código do relógio roda no Node com o `@zos/*` simulado (`npm run devicesim`). Na v4, a primeira ida ao aparelho já funcionou de ponta a ponta.

#### Sem `BigInt`, sem `TextEncoder`, sem `atob`

Tudo que normalmente vem pronto foi reimplementado: UTF-8, base64/base64url, hex. É pouco código, mas é necessário. Na Fase 2 isso se repete em escala maior: aritmética de 256 bits sem `BigInt`.

#### Fonte de aleatoriedade lenta e não documentada como tal

`getRandomValues` só existe no API_LEVEL 5.0. O substituto encontrado (`createChiper()`) custa ~300 ms por 16 bytes e não é documentado como gerador criptográfico. Por isso o RNG é marcado no relatório (`aes-keygen+sha256` ou `math-random-INSEGURO`). Para a assinatura, o RFC 6979 elimina a necessidade de aleatoriedade.

#### Logs volumosos e com dados sensíveis

- O `zeus bridge` registra cada frame BLE em hexadecimal; uma sessão curta gera dezenas de milhares de caracteres.
- Os logs da Vercel incluíam todos os cabeçalhos HTTP, com IP, geolocalização e token OIDC da plataforma.
- A sondagem enviava os endereços MAC e o UUID do relógio.

**Correções:** a sondagem passou a enviar só modelo, firmware e tela, e as evidências deste repositório foram transcritas sem identificadores. Ainda **é recomendável** reduzir o log de cabeçalhos no servidor.

### 5.2 Do processo (erros cometidos)

1. **Confiar na documentação para desenhar o adaptador nativo (v1).** O protocolo da v1 foi feito para contornar o IV não documentado do AES nativo (um "bloco aleatório prefixado"). Com o nativo inutilizável, ele foi descartado e substituído por um formato padrão (JWE), que só é possível quando controlamos o IV.
2. **Diagnóstico exploratório agressivo demais (v2).** Chamar funções não documentadas e vários formatos de uma vez, sem gravar o progresso, causou um reboot sem identificar a causa. A correção (v3) foi usar só a API documentada, ordenar do formato mais seguro para o menos testado e gravar migalhas.
3. **Generalização excessiva do bloqueio (v3).** Depois do crash em `aes.encrypt.arr`, o formato `number[]` foi bloqueado para *todas* as operações. Com isso perdeu-se a chance de saber se SHA-256 e HMAC nativos funcionam com `number[]` (os dois chegaram a ser chamados com esse formato sem crash, mas o resultado se perdeu no reboot). Com a mudança para JS puro isso deixou de importar, mas fica registrado como pergunta aberta.
4. **Erros pegos pelos testes antes de chegar ao relógio:**
   - uma chave de teste com 63 dígitos hexadecimais em vez de 64;
   - a codificação UTF-8 de um *surrogate* solto, que gerava bytes inválidos.

   Os dois mostram o valor da suíte local diante de um ciclo de teste lento no aparelho.
5. **Premissas conceituais do pedido inicial** (AES assimétrico, RSA simétrico, ECDSA como cifragem), corrigidas antes da implementação. Ver [Contexto](#1-contexto-e-objetivo).

### 5.3 Lições para as próximas fases

- **Não usar API nativa no caminho crítico da assinatura.** A Fase 2 será 100% JS puro, validada byte a byte contra bibliotecas de referência no Node.
- **Toda chamada nativa nova** (por exemplo, testar o `encryptKey` para proteger a chave em repouso) **passa por `nat()`**, com migalha, e é testada isoladamente, uma por versão.
- **Vetores determinísticos são a melhor ferramenta.** O RFC 6979 produz assinaturas determinísticas, então o relógio pode comparar sua assinatura com a da referência byte a byte, como já faz com o token JWE no KAT.
- **Medir no relógio, não estimar.** Já há uma amostra (143 ms para cifrar um JWE de 43 bytes). O custo por primitiva (KAT) e várias repetições ainda faltam e devem ser coletados antes de dimensionar a Fase 2.
- **Fixar a região do servidor e instrumentar os carimbos de tempo** nos três pontos (relógio, Side Service, servidor), conforme o procedimento da proposta.

## 6. Próximos passos

A Fase 1 deixou pronta a infraestrutura (relógio → BLE → app Zepp → servidor, relatórios, KAT, simulação local, migalhas) e eliminou a principal alternativa (API nativa). As próximas fases seguem o procedimento experimental da proposta, priorizando H1 e H2.

### 6.0 Fechar a Fase 1

- [x] **4 · Enviar msg** na v4: o servidor decifrou; cifrar levou 143 ms e o IV, 349 ms (20 nov. 2026, 1 amostra).
- [ ] **2 · KAT** na v4: registrar em [Resultados](#4-resultados) os vetores (todos devem passar) e os tempos por primitiva: AES-CBC 1 KB, SHA-256 1 KB, HMAC 1 KB, JWE de 100 bytes.
- [ ] Coletar várias execuções (≥ 10) para ter mediana e p95, não só um ponto.
- [ ] Opcional: repetir 1 · Sondagem e 3 · RNG para conferir estabilidade entre sessões.

### 6.1 Fase 2: assinatura x402 em JS puro (H1, H2, H5)

O que o relógio precisa produzir é uma assinatura ECDSA secp256k1 `(v, r, s)` sobre o hash EIP-712 de um `TransferWithAuthorization` (EIP-3009), aceita pelo contrato do USDC na Base Sepolia.

| Componente | Abordagem | Validação |
|---|---|---|
| Keccak-256 | JS puro com as *lanes* de 64 bits representadas como pares de inteiros de 32 bits (sem `BigInt`); ex.: `js-sha3` ou implementação própria | vetores conhecidos + comparação com a biblioteca de referência no Node |
| Hash EIP-712 de `TransferWithAuthorization` | codificação ABI dos campos (`from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`) e do domínio (`name`, `version`, `chainId`, `verifyingContract`), com o domínio **fixo no app**, nunca vindo do celular | 10 conjuntos de campos comparados com `viem`/`ethers` (H5) |
| secp256k1 | bignum com `Number`: `elliptic` sobre `bn.js` (sem `BigInt`) ou implementação mínima própria com limbs de 26 bits | assinaturas **idênticas byte a byte** às de `@noble/curves`/`viem` no Node (RFC 6979 é determinístico) |
| RFC 6979 | HMAC-DRBG com o **HMAC-SHA256 já validado nesta fase** | idem |
| Normalização | `s` baixo e `v` (recovery id) para EIP-3009 | recuperação do endereço `from` no Node |

**Medições (H2, H5):** 100 assinaturas de mensagens distintas, com mediana, p95 e máximo do tempo de assinatura e do hash EIP-712 separadamente; também tamanho do bundle e memória.

**Riscos já conhecidos:**

- Desempenho: aritmética de 256 bits com `Number` no QuickJS interpretado pode passar de 10 s, o limite de refutação de H2. Os tempos do KAT da Fase 1 darão a primeira estimativa.
- Tempo máximo de execução contínua: se houver watchdog para operações longas, a assinatura pode precisar ser fatiada em etapas com `setTimeout`, que existe no Bip 6.
- Bundle: as bibliotecas precisam passar pelo `qjsc` sem `BigInt`. Bibliotecas `@noble/*` estão descartadas, porque dependem de `BigInt`, inclusive em literais `1n`, que o `qjsc` rejeita na compilação (E1).

**Reaproveitamento da Fase 1:**

- `shared/sha256.js` (HMAC para o RFC 6979, SHA-256 para derivar entropia);
- `shared/bytes.js`;
- a estrutura KAT relógio ↔ servidor;
- a simulação local;
- as migalhas;
- o transporte.

### 6.2 Chave da carteira e entropia (H6, H7, RQ3)

- **Geração da chave:** combinar com hash várias fontes: o keygen do firmware (`createChiper()`, avaliado no E5), sensores, tempos de toque e uma semente do celular. Nenhuma fonte precisa ser confiável sozinha. Estimar a entropia de cada uma (H7).
- **Guarda da chave:** arquivo (`@zos/fs`) ou `localStorage`, sem proteção documentada. Tratar como chave de sessão de baixo valor, com perda limitada pelo saldo ou por limites on-chain (H6).
- **A testar com cuidado:** `encryptKey` (AES com chave de hardware/PUF), que poderia proteger a chave em repouso. Por causa dos reboots da Fase 1, deve ser testado isoladamente, com migalha, e o resultado conferido. Se o comportamento for como o do restante do `@zos/crypto` no Bip 6, será descartado.

### 6.3 Fase 3: pagamento x402 ponta a ponta (H3, H4, H8, H11)

Corresponde às etapas 4–7 da proposta:

1. **Side Service como cliente x402 (v2 de cabeçalhos):** recebe `HTTP 402`, decodifica `PAYMENT-REQUIRED` e repassa ao relógio só os campos necessários; depois monta `PAYMENT-SIGNATURE` com a assinatura do relógio.
2. **No relógio:** política local (tetos por pagamento e por período), exibição de valor e destinatário, confirmação por tecla física, conferência do domínio EIP-712 contra a lista fixa, montagem do hash e assinatura.
3. **Servidor de recursos próprio** com middleware x402, facilitator de teste e liquidação na Base Sepolia, até um pagamento liquidado com o hash da transação exibido no relógio.
4. **Instrumentação:** carimbos de tempo no relógio, no Side Service e no servidor; medição do desvio entre relógios; janelas de validade de 5 a 60 s (H3, H4); app Zepp em primeiro plano e em segundo plano (H11).
5. **Testes adversariais (H8):** Side Service que altera `payTo`, `value`, `asset` ou `chainId`, faz replay ou manda autorização expirada.

### 6.4 Papel do canal JWE da Fase 1

No x402 a integridade do pagamento vem da assinatura EIP-712, e o celular precisa ler a autorização para montar `PAYMENT-SIGNATURE`. O JWE da Fase 1 **não substitui** a assinatura. Ele continua útil para:

- validar e medir a criptografia simétrica no runtime;
- servir de canal autenticado relógio ↔ servidor para telemetria e medições, que o celular não pode forjar;
- comparar desempenho de primitivas (AES/SHA-256 contra Keccak/secp256k1).

### 6.5 O que saiu do plano

- **RSA:** o plano original previa RSA-OAEP em JS puro como terceira parte. Ele foi **retirado do caminho crítico**: o x402 em EVM não usa RSA e não há RSA nativo utilizável. Se necessário, pode voltar como referência de desempenho de aritmética de bignum sem `BigInt`.
- **API nativa `@zos/crypto`:** descartada para a pesquisa no Bip 6 atual (ver [Resultados](#4-resultados)). Vale reavaliar se o firmware for atualizado para API_LEVEL 5.0, que traz `getRandomValues`.
- **Ed25519 (H12):** continua opcional, por exemplo com `tweetnacl` (JS puro, sem `BigInt`), como comparação de desempenho com secp256k1.

### 6.6 Perguntas abertas

- Qual é o tempo máximo de execução contínua de um Device App antes de o sistema interromper?
- Qual é a memória disponível para o app (maior array alocável)? Faz parte da sondagem prevista na proposta e ainda não foi medido.
- SHA-256 e HMAC nativos funcionam com `number[]`? Não importa mais para a pesquisa, mas completaria a caracterização do `@zos/crypto`.
- O `createChiper()` usa um gerador de hardware ou um PRNG semeado? A documentação não diz, e a análise estatística de 128 amostras não distingue.

## 7. Como reproduzir

**Pré-requisitos:** Node.js 24, Zeus CLI 1.10.1 (`npm i -g @zeppos/zeus-cli`), um Amazfit Bip 6 pareado com o app Zepp em **modo desenvolvedor** e, para enviar ao servidor, uma instância do `smartwatch-x402-events`.

```bash
npm install

# 1) Testes locais (não precisam do relógio)
npm test            # selftest (OpenSSL/jose) + simulação do relógio

# 2) Build e instalação no relógio
zeus build          # gera dist/*.zab
zeus bridge         # no prompt: connect, depois install

# 3) No app Zepp: CryptoTest > Configurações > URL do servidor
#    (ex.: https://<projeto>.vercel.app/)

# 4) No relógio: 1 · Sondagem, 2 · KAT, 3 · RNG, 4 · Enviar msg

# 5) Decifrar localmente um envelope copiado do log do app-side
npm run decode -- arquivo-com-a-linha-de-log.txt
```

Cada botão mostra o resultado na tela, registra o relatório completo no log do `zeus bridge` e envia o relatório ao servidor, cuja resposta também aparece na tela.

### Estrutura do repositório

```
app.json, app.js            Mini app Zepp OS (alvo: Bip 6, tela quadrada 390x450)
page/                       Device App: tela com os 4 testes
utils/
  phase1-tests.js           Sondagem, KAT, RNG e envio de mensagem (roda no relógio)
  zcrypto.js                Uso mínimo do @zos/crypto: só o gerador de chaves
  crumbs.js                 Migalhas contra crash de chamadas nativas
  layout.js                 Layout da tela
shared/                     Código puro, roda no relógio e no Node
  aes.js                    AES-128 + CBC + PKCS#7
  sha256.js                 SHA-256 + HMAC-SHA256
  jwe.js                    JWE compacto dir + A128CBC-HS256
  bytes.js                  hex, base64, base64url, UTF-8 (sem TextEncoder/atob)
  config.js                 Chave de TESTE e vetores KAT
app-side/                   Side Service (no app Zepp do celular): repassa ao servidor
setting/                    Settings App: URL do servidor
tools/
  aes-reference.cjs         Referência do servidor (decifra JWE, analisa KAT/RNG) + CLI
  selftest.mjs              Testes contra OpenSSL e jose
  device-sim-test.mjs       Roda o código do relógio no Node com @zos/* simulados
  mocks/                    Simulação do @zos/crypto como o Bip 6 se comportou
types/zos-crypto.d.ts       Tipos do @zos/crypto (ausentes no @zeppos/device-types)
docs/evidencias/            Dados brutos dos experimentos (JSON); ver seção 8
```

O servidor fica em outro repositório, `smartwatch-x402-events` (Vercel). O arquivo `lib/aes-reference.cjs` de lá é uma cópia de `tools/aes-reference.cjs`, sem a CLI.

## 8. Evidências

Os arquivos em [`docs/evidencias/`](docs/evidencias/) têm os dados brutos dos experimentos, transcritos dos logs do `zeus bridge` e da Vercel de 19 e 20 nov. 2026.

**Removidos:** endereços MAC (BLE/Wi-Fi), UUID e número de série do relógio, endereços IP, geolocalização e tokens da plataforma Vercel.

| Arquivo | Conteúdo | Experimentos |
|---|---|---|
| [`01-sondagem-runtime.json`](docs/evidencias/01-sondagem-runtime.json) | Capacidades do runtime do Bip 6 e testes de sintaxe com o `qjsc` | E1, E2 |
| [`02-crypto-nativo.json`](docs/evidencias/02-crypto-nativo.json) | Comportamento do `@zos/crypto` no aparelho, os dois reboots, a migalha recuperada e os achados do firmware do simulador | E4, E6, E7, E8 |
| [`03-rng-createChiper.json`](docs/evidencias/03-rng-createChiper.json) | 128 chaves brutas geradas por `createChiper()` (base64) e a análise do servidor | E5 |
| [`04-transporte-e-servidor.json`](docs/evidencias/04-transporte-e-servidor.json) | Versões, fragmentação BLE e latência celular → servidor | E3 |
| [`05-teste-final-jwe.json`](docs/evidencias/05-teste-final-jwe.json) | Teste final da v4: token JWE do relógio, resposta do servidor, conferência independente, tempos e linha do tempo | E9 |

### Conferência da transcrição

As amostras do RNG podem ser reanalisadas com a mesma função que o servidor usou. O resultado precisa bater com o campo `analiseDoServidor` de cada execução:

```bash
node -e '
const ref = require("./tools/aes-reference.cjs");
const d = require("./docs/evidencias/03-rng-createChiper.json");
for (const e of d.execucoes) console.log(ref.analyzeRng({ raw: e.rawBase64, keyLen: 16 }));
'
```

As chaves do RNG foram geradas só para o teste estatístico e não protegem nada.

O token JWE do teste final pode ser decifrado de novo com a referência do servidor (e com a chave de teste do repositório):

```bash
node -e '
const e = require("./docs/evidencias/05-teste-final-jwe.json");
console.log(JSON.stringify({ kind: "aes.msg", payload: e.enviado_pelo_relogio }));
' | npm run -s decode -- -
```

## Avisos

- **A chave em `shared/config.js` é só de teste.** Ela fica no código-fonte e no pacote instalado. Não use para nada real.
- **As implementações de AES/SHA-256/HMAC são próprias.** Foram conferidas contra OpenSSL e `jose`, mas não foram auditadas, e o AES por tabela não roda em tempo constante. Servem para medir viabilidade, não para produção.
- **A qualidade do `createChiper()` como fonte de entropia só passou por testes estatísticos simples** (128 amostras). Isso não prova qualidade criptográfica.
- **Os tempos medidos no relógio vêm de uma única execução** (143 ms para cifrar, 349 ms para gerar o IV). O custo por primitiva (botão 2 · KAT) ainda não foi coletado (ver [Próximos passos](#6-próximos-passos)).
