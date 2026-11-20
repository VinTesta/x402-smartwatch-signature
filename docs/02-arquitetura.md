# 2. Arquitetura

## Componentes

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

### Device App (relógio)

- `page/index.js`: tela com quatro botões. Cada um executa um teste de forma síncrona, mostra um resumo na tela, registra o relatório completo no log (visível no `zeus bridge`) e envia o relatório ao celular com `this.request({ method: 'forward', ... })` da biblioteca ZML. Ao abrir, a página verifica se o teste anterior derrubou o relógio (ver *Migalhas*).
- `utils/phase1-tests.js`: os testes.
  - **Sondagem:** capacidades do runtime, sem identificadores do aparelho.
  - **KAT:** vetores conhecidos e tempos.
  - **RNG:** 64 chaves do firmware.
  - **Enviar msg:** JWE com IV aleatório.
- `utils/zcrypto.js`: o **único** uso do `@zos/crypto`, que é gerar chaves com `createChiper()`. Nenhuma operação nativa de cifra ou hash é chamada.
- `shared/*.js`: primitivas em JS puro (AES-128-CBC, SHA-256, HMAC-SHA256, JWE, codificações). São compartilhadas com os testes em Node.

### Side Service e Settings App (celular)

- `app-side/index.js`: recebe `{ kind, payload }` do relógio, registra no log e faz `POST` na URL configurada, com o cabeçalho `Title: zepp-<kind>`. Devolve ao relógio o status e o corpo da resposta. **Não tem chaves.**
- `setting/index.js`: campo para a URL do servidor, gravada no `settingsStorage`.

### Servidor

Repositório `smartwatch-x402-events`, função serverless na Vercel:

- `api/index.js`: registra a requisição. Quando o corpo traz `kind`, chama `handle()`.
- `lib/aes-reference.cjs`: cópia de `tools/aes-reference.cjs` deste repositório. Usa só o módulo `crypto` do Node:
  - `openJwe`: confere a tag **antes** de decifrar, com comparação em tempo constante;
  - `analyzeKat`: lista os vetores que falharam e os tempos;
  - `analyzeRng`: repetições, χ² dos bytes e proporção de bits 1.

## Formato da mensagem: JWE compacto `dir` + `A128CBC-HS256`

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

> Valores reais do teste final no Bip 6, em 20 nov. 2026 (ver [`evidencias/05-teste-final-jwe.json`](evidencias/05-teste-final-jwe.json)).

## Aleatoriedade

O Bip 6 está no API_LEVEL 4.2 e o `getRandomValues` só existe a partir do 5.0. Por isso, cada bloco de 16 bytes aleatórios é calculado assim:

```
SHA-256( createChiper() || contador || Date.now() )[0..16]
```

- O `createChiper()` de uma instância AES **sem chave importada** devolve uma chave nova gerada pelo firmware, a única operação nativa que funcionou.
- O SHA-256 é o nosso, então o "branqueamento" não depende do nativo.
- Se o keygen falhar ou for bloqueado, o app cai para `Math.random` e **marca a fonte como `math-random-INSEGURO`** no relatório, para que isso nunca passe despercebido.

## Migalhas contra crash (`utils/crumbs.js`)

Algumas chamadas nativas com argumentos inesperados reiniciam o relógio inteiro, e `try/catch` não ajuda. O mecanismo:

1. Antes de cada chamada nativa, grava o nome dela (ex.: `aes.keygen.createChiper`) no arquivo `crypto_crumb.txt` (`@zos/fs`).
2. Ao terminar o teste sem crash, apaga a migalha.
3. Ao abrir a página, se a migalha ainda existe, **a última chamada derrubou o relógio**. O nome vai para `crypto_blocked.json` e a chamada nunca mais é executada. A tela avisa o usuário.

No experimento E7 a migalha sobreviveu ao reboot e identificou a chamada `aes.encrypt.arr`, e a calibração seguinte rodou sem novo crash.

## Testes locais

| Comando | O que faz |
|---|---|
| `npm run selftest` | Compara `shared/` com o OpenSSL (`node:crypto`) e com a biblioteca `jose` em casos aleatórios e vetores oficiais; testa a rejeição de adulteração no servidor |
| `npm run devicesim` | Executa o **código real do relógio** (`utils/` + `shared/`) no Node, com `@zos/crypto`, `@zos/fs`, `@zos/device` e `@zos/settings` simulados como o Bip 6 se comportou. Exige **zero** chamadas a `encrypt`/`digest` nativos e simula um reboot para testar as migalhas |
| `npm run decode -- <arquivo>` | Decifra/analisa localmente um relatório copiado do log do app-side |

O build (`zeus build`) passa cada arquivo pelo `qjsc`, o mesmo compilador QuickJS usado no relógio. Isso funciona também como verificação de sintaxe do runtime.

## Mapa do código

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
