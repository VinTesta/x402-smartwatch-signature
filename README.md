# Criptografia moderna no Amazfit Bip 6 (Zepp OS): Fase 1

Repositório experimental da pesquisa **"Assinatura de pagamentos x402 em um smartwatch: avaliação de um assinante vestível restrito"** (Vinicius Passos, QI Tech).

A pesquisa investiga se um relógio comercial, o Amazfit Bip 6 com Zepp OS, consegue atuar como **assinante de pagamentos x402**. A ideia é que ele guarde uma chave privada (hot wallet local), mostre valor e destinatário, aplique uma política de gastos e calcule **no próprio relógio** a assinatura ECDSA secp256k1 de uma autorização EIP-3009/EIP-712. O celular só transporta mensagens, e um servidor executa a transação.

Este repositório é a **primeira etapa experimental**. Antes de investir em curvas elípticas, ele verifica o que o runtime do relógio realmente oferece, se dá para fazer criptografia moderna nele e se o caminho **relógio → celular → servidor** funciona de ponta a ponta.

> **Resultado principal:** o relógio cifrou uma mensagem com **AES-128-CBC + HMAC-SHA256 em JavaScript puro** (formato **JWE `dir` + `A128CBC-HS256`**, RFC 7516/7518). Ela foi transportada por BLE até o app Zepp no iPhone, enviada por HTTPS a um servidor na Vercel, e o servidor **decifrou com sucesso**. No teste final (20 nov. 2026), cifrar a mensagem levou **143 ms** no relógio. O caminho até lá exigiu abandonar a API nativa de criptografia do relógio, que se mostrou inutilizável no Bip 6 e, com um tipo de argumento, **reinicia o aparelho**.

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

Detalhes em [docs/04-resultados.md](docs/04-resultados.md) e evidências brutas em [docs/evidencias/](docs/evidencias/).

## Documentação

1. [Contexto e objetivo](docs/01-contexto-e-objetivo.md): a pesquisa x402, o papel desta fase e como o plano evoluiu
2. [Arquitetura](docs/02-arquitetura.md): componentes, fluxo, formato JWE, migalhas e mapa do código
3. [Diário de experimentos](docs/03-experimentos.md): os experimentos em ordem cronológica, com método e resultado
4. [Resultados](docs/04-resultados.md): tabelas consolidadas e relação com as hipóteses da proposta
5. [Dificuldades e lições](docs/05-dificuldades-e-licoes.md): erros, becos sem saída e o que mudou por causa deles
6. [Próximos passos](docs/06-proximos-passos.md): Fase 2 (secp256k1 + Keccak + EIP-712) e Fase 3 (x402 ponta a ponta)
7. [Evidências](docs/evidencias/): dados transcritos dos logs, sem identificadores pessoais

## Estrutura do repositório

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
docs/                       Documentação e evidências
```

O servidor fica em outro repositório, `smartwatch-x402-events` (Vercel). O arquivo `lib/aes-reference.cjs` de lá é uma cópia de `tools/aes-reference.cjs`, sem a CLI.

## Como reproduzir

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

## Avisos

- **A chave em `shared/config.js` é só de teste.** Ela fica no código-fonte e no pacote instalado. Não use para nada real.
- **As implementações de AES/SHA-256/HMAC são próprias.** Foram conferidas contra OpenSSL e `jose`, mas não foram auditadas, e o AES por tabela não roda em tempo constante. Servem para medir viabilidade, não para produção.
- **A qualidade do `createChiper()` como fonte de entropia só passou por testes estatísticos simples** (128 amostras). Isso não prova qualidade criptográfica.
- **Os tempos medidos no relógio vêm de uma única execução** (143 ms para cifrar, 349 ms para gerar o IV). O custo por primitiva (botão 2 · KAT) ainda não foi coletado (ver [Próximos passos](docs/06-proximos-passos.md)).
