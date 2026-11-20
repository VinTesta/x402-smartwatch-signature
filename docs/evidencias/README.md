# Evidências

Dados brutos dos experimentos, transcritos dos logs do `zeus bridge` e da Vercel de 19 e 20 nov. 2026.

**Removidos:** endereços MAC (BLE/Wi-Fi), UUID e número de série do relógio, endereços IP, geolocalização e tokens da plataforma Vercel.

| Arquivo | Conteúdo | Experimentos |
|---|---|---|
| [`01-sondagem-runtime.json`](01-sondagem-runtime.json) | Capacidades do runtime do Bip 6 e testes de sintaxe com o `qjsc` | E1, E2 |
| [`02-crypto-nativo.json`](02-crypto-nativo.json) | Comportamento do `@zos/crypto` no aparelho, os dois reboots, a migalha recuperada e os achados do firmware do simulador | E4, E6, E7, E8 |
| [`03-rng-createChiper.json`](03-rng-createChiper.json) | 128 chaves brutas geradas por `createChiper()` (base64) e a análise do servidor | E5 |
| [`04-transporte-e-servidor.json`](04-transporte-e-servidor.json) | Versões, fragmentação BLE e latência celular → servidor | E3 |
| [`05-teste-final-jwe.json`](05-teste-final-jwe.json) | Teste final da v4: token JWE do relógio, resposta do servidor, conferência independente, tempos e linha do tempo | E9 |

## Conferência da transcrição

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
