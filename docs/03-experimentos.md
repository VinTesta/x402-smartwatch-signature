# 3. Diário de experimentos

Os experimentos estão em ordem cronológica e foram feitos em 19 e 20 nov. 2026. Cada um registra o objetivo, o método, o resultado e a evidência. As versões do app citadas (v1–v4) correspondem a iterações sucessivas do mini app instalado no relógio pelo `zeus bridge`.

**Ambiente:**

| Item | Valor |
|---|---|
| Relógio | Amazfit Bip 6, Zepp OS 5, firmware 4.6.0.3, API_LEVEL 4.2 |
| Celular | iPhone com iOS 26.6.1 e app Zepp 10.10.5 em modo desenvolvedor |
| Desenvolvimento | Zeus CLI 1.10.1 (zpm 3.5.0, `qjsc` QuickJS 2020-07-05), Node.js 24, Linux |
| Servidor | Vercel (Node), repositório `smartwatch-x402-events` |

---

## E0. Levantamento da documentação

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

## E1. `BigInt` no compilador

**Objetivo:** confirmar a premissa de que não há `BigInt`, sem depender do aparelho.

**Método:** o Zeus CLI traz o `qjsc` que compila o código do relógio para bytecode QuickJS. Compilamos trechos de teste com ele.

**Resultado:**

- Versão `QuickJS Compiler version 2020-07-05`.
- `var a = 1n` falha com **`SyntaxError: invalid number literal`**, e `qjsc -fbignum` responde **`unsupported feature: bignum`**. O binário foi compilado sem `CONFIG_BIGNUM`.
- Sintaxe ES2020 (`**`, `?.`, `??`, `async/await`, spread de objeto, campos de classe, geradores) compila normalmente.

**Evidência:** [`evidencias/01-sondagem-runtime.json`](evidencias/01-sondagem-runtime.json), seção `compilador_qjsc`.

## E2. Sondagem do runtime no aparelho (v1)

**Objetivo:** tabela de capacidades do Bip 6 (etapa 1 da proposta).

**Método:** botão **1 · Sondagem**. Registra `typeof` de várias APIs globais, `getSystemInfo()`, os exports do `@zos/crypto` e a fonte de aleatoriedade escolhida.

**Resultado:**

- `BigInt`: `undefined`. Confirmado no aparelho.
- `Promise`, `setTimeout`, `Proxy`, `WeakMap`, `Symbol`, `Math.imul`, `Uint8Array` e `DataView`: todos `function`.
- `TextEncoder`, `TextDecoder`, `atob`, `btoa` e `eval`: todos `undefined`.
- Exports do `@zos/crypto`: `checkAvailable`, `createCrypto`, `encryptKey`, `alg`, `digest`, `ecp_dp`, `default`. Dois deles (`checkAvailable`, `digest`) não aparecem na documentação.
- `Object.keys(alg)` devolve `[]`, mas `alg.AES_CBC` existe: as constantes não são enumeráveis.

**Evidência:** [`evidencias/01-sondagem-runtime.json`](evidencias/01-sondagem-runtime.json).

## E3. Transporte de ponta a ponta

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

**Evidência:** [`evidencias/04-transporte-e-servidor.json`](evidencias/04-transporte-e-servidor.json).

## E4. AES/SHA/HMAC nativos, conforme a documentação (v1)

**Objetivo:** cifrar com AES-128-CBC nativo e descobrir o comportamento não documentado: IV, padding e efeito do `key_encrypt`.

**Método:** botão **2 · AES KAT**, com sete testes de AES (t1 a t7) e vetores de SHA-256 e HMAC, todos com `Uint8Array`, como no exemplo de AES da documentação. O servidor deduziria o IV por `IV = AES-ECB⁻¹(C₁) ⊕ P₁`.

**Resultado:** **todas as chamadas `encrypt()` devolveram `undefined`**: SHA-256, HMAC e os sete testes de AES. O `createCrypto()` funcionou, devolvendo instâncias. A mensagem real (botão 4) falhou porque o SHA-256 usado no RNG falhou.

**Evidência:** [`evidencias/02-crypto-nativo.json`](evidencias/02-crypto-nativo.json), evento v1.

## E5. Gerador de chaves do firmware como fonte de aleatoriedade (v1)

**Objetivo:** avaliar `createChiper()`, que gera uma chave AES, como substituto do `getRandomValues`.

**Método:** botão **3 · RNG**, com 64 chaves de 16 bytes por execução. O servidor calcula repetições, χ² dos 256 valores de byte (255 graus de liberdade) e proporção de bits 1. Foram duas execuções.

**Resultado:**

| Execução | Chaves | Repetidas | χ² | z | Bits 1 | Tempo |
|---|---|---|---|---|---|---|
| 1 | 64 | 0 | 280,5 | 1,13 | 0,5115 | 19.272 ms |
| 2 | 64 | 0 | 250,0 | −0,22 | 0,4974 | 19.346 ms |
| Juntas | 128 | 0 | 270,3 | 0,68 | 0,5045 | ~301 ms/chave |

Nenhuma anomalia grosseira. A amostra é pequena e **não prova qualidade criptográfica**. Um bloco aleatório de 16 bytes custa ~300 ms no relógio.

**Evidência:** [`evidencias/03-rng-createChiper.json`](evidencias/03-rng-createChiper.json), com as amostras brutas. As estatísticas recalculadas a partir delas batem exatamente com as do servidor.

## E6. Diagnóstico exploratório (v2): reboot do relógio

**Objetivo:** descobrir o formato que o firmware espera, testando sistematicamente variantes.

**Método:** um botão de diagnóstico que testava:

- formatos de entrada (`Uint8Array`, `ArrayBuffer`, `number[]`);
- opções de criação;
- leitura de vários campos de resultado;
- **funções não documentadas**: `checkAvailable()`, `digest()` e o algoritmo `AES_ECB`, visto no firmware.

**Resultado:** **o relógio inteiro reiniciou.** Como essa versão não gravava o progresso fora da memória, não foi possível saber qual chamada causou o reboot.

**Lição:** chamadas nativas com argumentos inesperados podem derrubar o sistema operacional do relógio, não só o app. Isso motivou o mecanismo de migalhas e a regra de **nunca chamar funções não documentadas** sem proteção.

## E7. Calibração com migalhas (v3): reboot identificado

**Objetivo:** repetir a busca de formatos, agora só com a API documentada, ordenando dos formatos mais seguros para os menos testados e protegendo cada chamada nativa com uma migalha gravada em arquivo.

**Resultado:**

1. A primeira execução **reiniciou o relógio de novo**.
2. Ao reabrir o app, **a migalha estava lá: `aes.encrypt.arr`**, ou seja, `AES_CBC.encrypt()` com a entrada em `number[]`. A tela mostrou o aviso e a chamada foi bloqueada.
3. A calibração seguinte rodou **sem novo crash** e mostrou que:
   - SHA-256 e HMAC devolvem `undefined` com `Uint8Array` e `ArrayBuffer`, em todas as opções e formatos de chave;
   - no AES, `createChiper()` numa instância criada com `private_key` **ignora a chave informada e devolve outra chave aleatória**; com a chave em `number[]` devolve `undefined`;
   - mesmo com `key_encrypt: 1` e `createChiper()`, que é o fluxo do exemplo da documentação, `encrypt()` continua `undefined`.

**Conclusão:** no Bip 6 (fw 4.6.0.3), as operações de cifra e hash do `@zos/crypto` **não são utilizáveis** por um mini app. A única operação que funciona é a geração de chave.

**Evidência:** [`evidencias/02-crypto-nativo.json`](evidencias/02-crypto-nativo.json), eventos v3.

## E8. Análise do firmware do simulador

**Objetivo:** entender o módulo nativo sem arriscar o aparelho.

**Método:** o simulador oficial baixa um firmware ARM com símbolos de debug (`main.elf`). Analisamos suas strings e sua tabela de símbolos com `strings` e `readelf`.

**Resultado:**

- O módulo `js_crypto_module.c` registra mais algoritmos do que a doc: `AES_ECB`, `AES_CFB`, `3DES`, `CRC16/32` e constantes internas de RSA/DES.
- As constantes usam `JS_PROP_CONFIGURABLE`, ou seja, não são enumeráveis.
- **A implementação de cada algoritmo não está no firmware do emulador**, só o esqueleto do módulo e o mbedTLS. Por isso o simulador não serve para testar criptografia nativa.

## E9. Criptografia em JS puro e JWE (v4): sucesso de ponta a ponta

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

**Pendente:** registrar o resultado do botão **2 · KAT** da v4 (vetores e tempos por primitiva) e repetir o envio várias vezes para ter mediana e p95. O KAT separa o custo de cada primitiva em JS puro no Bip 6 (ver [resultados](04-resultados.md)).
