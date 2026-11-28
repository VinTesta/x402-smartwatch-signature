# invoice-server

Servidor HTTP de cobrança. Objetivo final: expor um recurso protegido por **x402** (responde
`402 Payment Required`), validar a assinatura EIP-3009/EIP-712 produzida pelo relógio e liquidar
via facilitator na Base Sepolia.

**Estado atual (2026-11-24):** rotas de teste da assinatura (cobrança e validação), ainda sem x402.

## Rotas

| Rota | O que faz |
|---|---|
| `GET /invoice[?from=0x..&to=0x..]` | Devolve o corpo da cobrança: `typedData` EIP-712 de um `TransferWithAuthorization` (USDC, Base Sepolia, chainId 84532), com `nonce` aleatório e validade de 300 s. Números como string decimal (o relógio não tem `BigInt`). |

| `POST /validate` | Valida a assinatura EIP-712 feita pelo relógio, com o `viem` (verificador independente do código do relógio). |

### `POST /validate`

Corpo JSON:

| Campo | Formatos aceitos |
|---|---|
| `publicKey` | endereço (`0x` + 40 hex) ou chave pública secp256k1: comprimida (`0x02`/`0x03` + 64 hex) ou não comprimida (`0x04` + 128 hex, ou os 128 hex sem o `04`) |
| `transaction` | a cobrança inteira de `/invoice`, o `typedData` ou só a `message` |
| `signature` | `0x` + 130 hex (`r‖s‖v`) ou `{ r, s, v }` com `v` = 27/28 (ou 0/1) |

O hash é sempre calculado com o **domínio e os tipos do servidor**. Resposta `200`:

```json
{
  "ok": true,
  "valid": true,
  "checks": {
    "signatureMatchesPublicKey": true,
    "fromMatchesSigner": true,
    "domainMatches": true,
    "lowS": true
  },
  "timeWindow": { "now": 0, "validAfter": "0", "validBefore": "0", "ok": true },
  "digest": "0x…",
  "recovered": { "address": "0x…", "publicKey": "0x04…" },
  "expected": { "format": "address", "address": "0x…" }
}
```

- `valid` = todas as `checks`: a assinatura é da chave informada; o signatário é o `from` (exigência
  do EIP-3009); o domínio enviado (se houver) é o do servidor; `s` baixo (EIP-2).
- `timeWindow.ok` é **informativo** e não entra em `valid`, para permitir validar assinaturas de
  teste já vencidas.
- Entrada malformada → `400` com `error`; método diferente de `POST` → `405`.

Parâmetros de query `from` e `to` de `/invoice`: **endereços** (`0x` + 40 hex), que é o que o EIP-3009 usa (os
últimos 20 bytes do keccak256 da chave pública). Parâmetro presente e inválido → `400`.
O relógio envia `from` = endereço da própria carteira e `to` = endereço genérico de teste.

## Configuração (variáveis de ambiente, todas opcionais)

| Variável | Uso | Padrão |
|---|---|---|
| `PAYER_ADDRESS` | campo `from` padrão (a query `?from=` tem prioridade) | endereço zero |
| `PAY_TO` | campo `to` padrão (a query `?to=` tem prioridade) | endereço zero |
| `INVOICE_VALUE` | valor em unidades mínimas de USDC (6 casas) | `10000` (0,01 USDC) |
| `INVOICE_TTL` | validade em segundos | `300` |
| `PORT` | porta do servidor local | `3000` |

## Rodar

```bash
npm install
npm start                      # local: http://localhost:3000/invoice e /validate
```

Na Vercel, cada arquivo de `api/` vira uma função e `vercel.json` mapeia `/invoice` e `/validate`.
O deploy atual usa uma cópia destes arquivos no repositório
[`VinTesta/smartwatch-x402-events`](https://github.com/VinTesta/smartwatch-x402-events) (o mesmo
servidor da Fase 1); mudanças aqui precisam ser copiadas para lá. O celular
precisa alcançar o servidor por HTTPS público (Vercel ou túnel): configure a URL base no Settings
App do `zepp-app`.
