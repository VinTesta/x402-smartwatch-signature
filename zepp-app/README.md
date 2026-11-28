# zepp-app

Mini app Zepp OS para o Amazfit Bip 6: **Device App** (relógio), **Side Service** e **Settings App**
(os dois últimos rodam no app Zepp do celular). Estado em 2026-11-24: teste de assinatura EIP-712,
ainda sem x402. Resultados em [`../docs/fase-2-assinatura-eip712.md`](../docs/fase-2-assinatura-eip712.md).

## Estrutura

| Caminho | Onde roda | O que faz |
|---|---|---|
| `app.js` | relógio | `App(BaseApp(...))`: obrigatório para o `BasePage` do ZML funcionar |
| `page/index.js` | relógio | Tela: "Buscar cobrança", "Assinar e enviar", status e corpo da cobrança. `signAndSend()` faz o hash EIP-712 e a assinatura secp256k1 |
| `page/index.[rs].layout.js`, `utils/layout.js` | relógio | Layout (telas redonda e quadrada) |
| `utils/crumbs.js` | relógio | Migalhas: grava a etapa da assinatura em arquivo; após um reboot a tela mostra onde parou |
| `app-side/index.js` | celular | `address.get` (só o endereço), `invoice.get` (`GET <servidor>/invoice?from=&to=`), `key.get` (chave de teste + endereço, só na hora de assinar) e `signature.validate` (`POST <servidor>/validate`) |
| `setting/index.js` | celular | URL do servidor e chave privada de **teste**; mostra o endereço derivado |
| `shared/config.js` | ambos | Constantes, métodos da mensageria e **domínio EIP-712 fixo** |
| `shared/eth-address.js` | só celular | Endereço a partir da chave (o `getPublic` é caro demais no relógio) |

Bibliotecas: `@zeppos/zml` (mensageria), `elliptic`, `js-sha3`, `bn.js` (JS puro, sem `BigInt`).
Do `elliptic` importam-se só `lib/elliptic/ec/index.js` e `lib/elliptic/utils.js`: a raiz do pacote
lê o próprio `package.json`, que o Rollup do Zeus não empacota.

## Fluxo ao buscar a cobrança (relógio)

1. `address.get`: endereço da carteira (calculado no celular; a chave não trafega).
2. `invoice.get` com `from` = esse endereço e `to` = `TEST_PAY_TO` (conta nº 1 pública do
   Hardhat/Anvil, só para testes).
3. Mostra a cobrança e **monta a curva uma única vez na sessão** (~14 s, tela acesa). As
   assinaturas seguintes reaproveitam a curva (só dados públicos; chave e nonce nunca são guardados).

## Fluxo de assinatura (relógio)

1. **Chave:** pede ao celular `{ privateKey, address }`.
2. **Hash EIP-712:** confere o domínio recebido contra o fixo e calcula
   `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct)`.
3. **Curva:** já montada ao buscar a cobrança (só monta aqui se ainda não existir).
4. **Assinatura:** RFC 6979, `s` baixo, `v = 27 + recoveryParam` (~22 s). A assinatura aparece na
   tela antes do envio.
5. **Envio:** `signature.validate` → Side Service → `POST /validate` com `{ publicKey: endereço,
   transaction: { domínio fixo do app, primaryType, message }, signature }`. A tela mostra o
   veredito do servidor (`VÁLIDA ✓`/`INVÁLIDA ✗`), cada verificação, se o digest do servidor bate com
   o do relógio e o tempo celular↔servidor. Se o envio falhar, a assinatura continua na tela.

Antes de cada etapa: migalha em arquivo, status na tela e pausa curta. A tela fica acesa durante a
assinatura. **Não toque no relógio até terminar.**

## Restrições (fase de teste)

- A chave é digitada no celular e o app Zepp a registra em log: use **somente carteira de teste
  sem fundos**. Na versão final a chave será gerada e guardada no relógio.
- O endereço vem do celular; um valor falso só causa negação de serviço.

## Como rodar

```bash
npm install
zeus build
zeus bridge            # connect → install; deixe aberto para ver os logs do relógio e do celular
```

No app Zepp: este app → Configurações → URL do servidor (com `https://`) e chave de teste.
O relógio envia o próprio endereço como `from`; o `PAYER_ADDRESS` do servidor não é mais necessário.
