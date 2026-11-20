# 4. Resultados

Resultados consolidados da Fase 1, com o experimento de origem entre parênteses (ver o [diário](03-experimentos.md)). Os dados brutos estão em [`evidencias/`](evidencias/).

## 4.1 Capacidades do runtime do Bip 6

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

## 4.2 API nativa de criptografia (`@zos/crypto`)

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

## 4.3 Aleatoriedade (E5)

| Medida | Valor |
|---|---|
| Fonte | `createCrypto(AES_CBC, {key_bit_length:128, key_encrypt:0}).createChiper()` |
| Amostras | 128 chaves × 16 bytes (2 execuções) |
| Chaves repetidas | 0 |
| χ² dos bytes (255 g.l.) | 270,3 (z = 0,68) |
| Proporção de bits 1 | 0,5045 |
| Custo | ~301 ms por chave (19,3 s para 64) |

Não há anomalias grosseiras. Um IV de 16 bytes custa ~0,3 s. A assinatura ECDSA com RFC 6979 **não precisa** de aleatoriedade, mas a geração da chave da carteira e o nonce do EIP-3009 (32 bytes) podem usar essa fonte, combinada com outras (H7).

## 4.4 Transporte (E3)

| Medida | Valor |
|---|---|
| Payload útil por frame BLE (ZML) | 3.584 bytes; maior frame observado: 3.600 bytes |
| Mensagem fragmentada | 4.806 bytes em 2 frames, entregue íntegra |
| Side Service → servidor → Side Service | 479 ms (1ª da sessão), 215 ms, 189 ms (19 nov.); 1.238 ms (20 nov., 1ª requisição após ~1 dia sem uso) |
| Criação da mensagem no relógio → chegada no celular | ≈ 1,5 s (1 amostra, relógios não sincronizados; inclui ~0,5 s de criptografia e a abertura do Side Service) |
| Região da função | `iad1` (EUA), borda `gru1` (São Paulo) |

As medições ainda são poucas e foram feitas sem instrumentação de carimbos de tempo no relógio. A decomposição da latência (RQ2) será medida com rigor nas próximas fases. Para isso, a função do servidor deve ser fixada numa região próxima.

## 4.5 Criptografia em JS puro (E9)

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

## 4.6 Situação das hipóteses da proposta

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

## 4.7 Resultado da Parte 1 do plano de testes

| Critério | Status |
|---|---|
| Relógio cifra uma mensagem com chave simétrica | ✅ AES-128-CBC + HMAC-SHA256 em JS puro (JWE) |
| Mensagem transportada pelo app Zepp até o servidor | ✅ |
| Servidor decifra e confere a integridade | ✅ |
| Adulteração rejeitada | ✅ (testado localmente e contra o servidor em produção) |
| Usar a API nativa do relógio | ❌ inviável no Bip 6 fw 4.6.0.3 (ver 4.2) |
| Tempos medidos no relógio | ◐ parcial: cifrar 143 ms e IV 349 ms (1 amostra); custo por primitiva (KAT) pendente |
