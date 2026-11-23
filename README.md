# x402 no Zepp OS: assinatura de pagamentos em um smartwatch

Pesquisa e implementação de um **assinante de pagamentos [x402](https://www.x402.org/)** rodando em um
**Amazfit Bip 6 (Zepp OS)**: o relógio guarda a chave, mostra o pagamento, coleta a aprovação do
usuário e assina a autorização EIP-3009/EIP-712 com ECDSA secp256k1, em JavaScript puro e sem `BigInt`.
O celular (app Zepp) apenas transporta as mensagens até o servidor de cobrança.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| [`article/`](article/) | O artigo, versionado |
| [`invoice-server/`](invoice-server/) | Servidor HTTP de cobrança com middleware x402 |
| [`zepp-app/`](zepp-app/) | Mini app Zepp OS: Device App (relógio) + Side Service e Settings App (celular) |
| [`docs/`](docs/) | Documentação de apoio |

## Arquitetura

```
┌───────────────────────┐   BLE    ┌──────────────────────┐  HTTPS   ┌──────────────────────┐
│ Relógio (Bip 6)       │ ───────▶ │ Celular (app Zepp)   │ ───────▶ │ Servidor de cobrança │
│ chave, política,      │ ◀─────── │ Side Service:        │ ◀─────── │ HTTP 402 + middleware│
│ aprovação, assinatura │          │ só transporta        │          │ x402, verificação    │
└───────────────────────┘          └──────────────────────┘          └──────────────────────┘
```

## Estado

- **Fase 1 (concluída, nov. 2026):** sondagem do runtime e criptografia simétrica em JS puro no
  relógio, validada de ponta a ponta. Resultados e limitações do hardware em
  [`docs/fase-1-resultados-e-limitacoes.md`](docs/fase-1-resultados-e-limitacoes.md).
- **Fase 2:** secp256k1 + RFC 6979 + Keccak-256 + EIP-712 em JS puro no relógio.
- **Fase 3:** pagamento x402 ponta a ponta na Base Sepolia.
