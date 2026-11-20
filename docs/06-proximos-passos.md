# 6. Próximos passos

A Fase 1 deixou pronta a infraestrutura (relógio → BLE → app Zepp → servidor, relatórios, KAT, simulação local, migalhas) e eliminou a principal alternativa (API nativa). As próximas fases seguem o procedimento experimental da proposta, priorizando H1 e H2.

## 6.0 Fechar a Fase 1

- [ ] Rodar **2 · KAT** e **4 · Enviar msg** na v4 e registrar em [Resultados](04-resultados.md) os vetores (todos devem passar) e os tempos: AES-CBC 1 KB, SHA-256 1 KB, HMAC 1 KB, JWE de 100 bytes, custo do IV.
- [ ] Coletar várias execuções (≥ 10) para ter mediana e p95, não só um ponto.
- [ ] Opcional: repetir 1 · Sondagem e 3 · RNG para conferir estabilidade entre sessões.

## 6.1 Fase 2: assinatura x402 em JS puro (H1, H2, H5)

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

## 6.2 Chave da carteira e entropia (H6, H7, RQ3)

- **Geração da chave:** combinar com hash várias fontes: o keygen do firmware (`createChiper()`, avaliado no E5), sensores, tempos de toque e uma semente do celular. Nenhuma fonte precisa ser confiável sozinha. Estimar a entropia de cada uma (H7).
- **Guarda da chave:** arquivo (`@zos/fs`) ou `localStorage`, sem proteção documentada. Tratar como chave de sessão de baixo valor, com perda limitada pelo saldo ou por limites on-chain (H6).
- **A testar com cuidado:** `encryptKey` (AES com chave de hardware/PUF), que poderia proteger a chave em repouso. Por causa dos reboots da Fase 1, deve ser testado isoladamente, com migalha, e o resultado conferido. Se o comportamento for como o do restante do `@zos/crypto` no Bip 6, será descartado.

## 6.3 Fase 3: pagamento x402 ponta a ponta (H3, H4, H8, H11)

Corresponde às etapas 4–7 da proposta:

1. **Side Service como cliente x402 (v2 de cabeçalhos):** recebe `HTTP 402`, decodifica `PAYMENT-REQUIRED` e repassa ao relógio só os campos necessários; depois monta `PAYMENT-SIGNATURE` com a assinatura do relógio.
2. **No relógio:** política local (tetos por pagamento e por período), exibição de valor e destinatário, confirmação por tecla física, conferência do domínio EIP-712 contra a lista fixa, montagem do hash e assinatura.
3. **Servidor de recursos próprio** com middleware x402, facilitator de teste e liquidação na Base Sepolia, até um pagamento liquidado com o hash da transação exibido no relógio.
4. **Instrumentação:** carimbos de tempo no relógio, no Side Service e no servidor; medição do desvio entre relógios; janelas de validade de 5 a 60 s (H3, H4); app Zepp em primeiro plano e em segundo plano (H11).
5. **Testes adversariais (H8):** Side Service que altera `payTo`, `value`, `asset` ou `chainId`, faz replay ou manda autorização expirada.

## 6.4 Papel do canal JWE da Fase 1

No x402 a integridade do pagamento vem da assinatura EIP-712, e o celular precisa ler a autorização para montar `PAYMENT-SIGNATURE`. O JWE da Fase 1 **não substitui** a assinatura. Ele continua útil para:

- validar e medir a criptografia simétrica no runtime;
- servir de canal autenticado relógio ↔ servidor para telemetria e medições, que o celular não pode forjar;
- comparar desempenho de primitivas (AES/SHA-256 contra Keccak/secp256k1).

## 6.5 O que saiu do plano

- **RSA:** o plano original previa RSA-OAEP em JS puro como terceira parte. Ele foi **retirado do caminho crítico**: o x402 em EVM não usa RSA e não há RSA nativo utilizável. Se necessário, pode voltar como referência de desempenho de aritmética de bignum sem `BigInt`.
- **API nativa `@zos/crypto`:** descartada para a pesquisa no Bip 6 atual (ver [Resultados](04-resultados.md)). Vale reavaliar se o firmware for atualizado para API_LEVEL 5.0, que traz `getRandomValues`.
- **Ed25519 (H12):** continua opcional, por exemplo com `tweetnacl` (JS puro, sem `BigInt`), como comparação de desempenho com secp256k1.

## 6.6 Perguntas abertas

- Qual é o tempo máximo de execução contínua de um Device App antes de o sistema interromper?
- Qual é a memória disponível para o app (maior array alocável)? Faz parte da sondagem prevista na proposta e ainda não foi medido.
- SHA-256 e HMAC nativos funcionam com `number[]`? Não importa mais para a pesquisa, mas completaria a caracterização do `@zos/crypto`.
- O `createChiper()` usa um gerador de hardware ou um PRNG semeado? A documentação não diz, e a análise estatística de 128 amostras não distingue.
