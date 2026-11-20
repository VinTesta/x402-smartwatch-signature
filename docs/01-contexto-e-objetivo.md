# 1. Contexto e objetivo

## A pesquisa

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

## O papel deste repositório

Na proposta, o procedimento experimental começa pela **sondagem do runtime** (etapa 1). O motivo é resolver primeiro a maior incerteza com o menor esforço: se o relógio não conseguir fazer criptografia, o projeto muda antes de qualquer trabalho de interface ou servidor.

Este repositório cumpre essa função e vai um pouco além. Ele:

1. **mede as capacidades reais** do runtime do Bip 6 (`BigInt`, `Promise`, APIs de texto, módulo nativo de criptografia, fonte de aleatoriedade);
2. **testa criptografia moderna no relógio**, começando pela simétrica (AES + HMAC), que é a mais simples e cujas primitivas (SHA-256, HMAC-SHA256) também serão usadas pelo RFC 6979 na assinatura ECDSA;
3. **monta e valida a infraestrutura de ponta a ponta**: relógio → BLE → Side Service no app Zepp → HTTPS → servidor, com relatórios estruturados e conferência automática no servidor;
4. **cria a metodologia de teste** para um dispositivo em que algumas chamadas nativas derrubam o sistema: migalhas, vetores conhecidos (KAT) e simulação local do código do relógio.

## O plano inicial e como ele evoluiu

O plano inicial dividia os testes em três partes, da mais simples para a mais complexa, a ser executadas uma por vez:

| Parte | Plano original | O que aconteceu |
|---|---|---|
| 1 | AES com a API nativa `@zos/crypto` | A API nativa se mostrou inutilizável no Bip 6 (ver [experimentos](03-experimentos.md)). A Parte 1 foi concluída com **AES-128-CBC + HMAC-SHA256 em JS puro**, no formato padrão **JWE**, e o servidor decifrou a mensagem do relógio. |
| 2 | ECDSA com a API nativa (secp256k1) | A API nativa só aceita digest MD5, incompatível com EIP-712 (Keccak-256), e o restante do módulo não funciona no aparelho. A Parte 2 passa a ser **secp256k1 + RFC 6979 + Keccak-256 + EIP-712 em JS puro**: o núcleo da hipótese H1. |
| 3 | RSA em JS puro (bignum sem `BigInt`) | **Retirada do caminho crítico.** O x402 em EVM não usa RSA. A Parte 3 passa a ser o **pagamento x402 ponta a ponta** na Base Sepolia (etapas 4–6 da proposta). |

Detalhes em [Próximos passos](06-proximos-passos.md).

## Correção de premissas do enunciado original

Ao começar, o pedido de teste continha três confusões conceituais, corrigidas antes da implementação e registradas aqui porque ajudam quem lê o código:

- **AES é simétrico** (uma única chave compartilhada), não assimétrico.
- **RSA é assimétrico** (par de chaves pública e privada), não simétrico.
- **ECDSA é assinatura, não cifragem.** Ele prova autoria e integridade, mas não esconde o conteúdo. Para cifrar com curva elíptica usa-se ECDH/ECIES. **No x402, o que importa é exatamente a assinatura**, não a cifragem.

## Relação com as perguntas de pesquisa

| Pergunta / hipótese | Contribuição desta fase |
|---|---|
| **RQ1 / H1** (viabilidade sem `BigInt`) | Confirma a ausência de `BigInt` no Bip 6 e mostra que primitivas de 32 bits (SHA-256, HMAC, AES) rodam corretamente no runtime. Ainda **não** testa secp256k1. |
| **RQ2** (decomposição de latência) | Primeiras medições do trecho celular → servidor e da fragmentação BLE; infraestrutura de relatórios pronta. |
| **RQ3 / H7** (garantias sem hardware seguro; entropia) | Encontra uma fonte de entropia no firmware (`createChiper`) e documenta que as operações nativas de cifra e hash não funcionam no Bip 6. O `encryptKey` (AES com chave de hardware/PUF), candidato a proteger a chave em repouso, **ainda não foi testado**. |
| **RQ4 / H8** (o que o celular consegue fazer) | Observa que o app Zepp, em modo desenvolvedor, registra em log todo payload BLE do relógio. O celular vê tudo o que o relógio envia. |
