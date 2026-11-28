# Fase 2: assinatura EIP-712 no relógio (resultados parciais)

Resumo dos experimentos de 23 e 24 nov. 2026. Este arquivo registra o que foi aprendido, para
servir de base ao artigo e às próximas etapas. A Fase 2 continua em andamento.

## Ambiente

| Item | Valor |
|---|---|
| Relógio | Amazfit Bip 6, Zepp OS 5, firmware 4.6.0.3, API_LEVEL 4.2 (QuickJS sem `BigInt`) |
| Celular | iPhone, app Zepp em modo desenvolvedor (Side Service runtime 4.3.0) |
| Toolchain | Zeus CLI (zpm 3.5.0: Rollup + `qjsc`), Node.js 24, Linux |
| Bibliotecas no relógio | `elliptic` 6.6.1, `js-sha3` 0.9.3, `bn.js` 4.12 (JS puro, sem `BigInt`) |
| Servidor | Função serverless na Vercel (Node): `GET /invoice` e `POST /validate` (`viem` 2.58) |
| Referências de validação | `viem` no Node; QuickJS compilado para WASM (`quickjs-emscripten`) |

## Resultado principal

O relógio calculou, **em JavaScript puro e sem `BigInt`**, uma assinatura **ECDSA secp256k1**
(nonce determinístico RFC 6979, `s` baixo) sobre o hash **EIP-712** de uma autorização
`TransferWithAuthorization` (**EIP-3009**) do USDC na Base Sepolia. O `viem` recupera, a partir do
digest e da assinatura gerados no relógio, exatamente o endereço da carteira de teste.

**Fluxo completo validado no aparelho (24 nov. 2026):** o relógio buscou a cobrança (com `from` =
sua carteira e `to` = endereço de teste), assinou e enviou a assinatura ao servidor, que a validou
de forma independente com o `viem`. A tela do relógio mostrou **VÁLIDA ✓**, com as quatro
verificações aprovadas (assinatura da chave informada, signatário = `from`, domínio igual ao do
servidor, `s` baixo) e o digest calculado pelo servidor igual ao do relógio. Do toque em "Assinar"
ao veredito: **22,0 s**.

| Etapa no Bip 6 | Amostra 1 | Amostra 2 | QuickJS no desktop | Fator |
|---|---|---|---|---|
| Hash EIP-712 (Keccak-256 + codificação ABI) | **0,19 s** | **0,17 s** | 3,5 ms | ~55x |
| Montar a curva (`new EC('secp256k1')`, 1 vez por sessão) | **13,6 s** | **13,6 s** | 34 ms | ~400x |
| Assinar (`sign`) | **21,6 s** | **20,8 s** | 35 ms | ~620x |
| Derivar o endereço (`getPublic`; depois movido ao celular) | **19,6 s** | — | 28 ms | ~700x |
| Enviar ao servidor e receber o veredito (BLE + HTTPS 0,26 s) | — | **0,62 s** | — | — |
| Do toque ao resultado | 56,0 s | **22,0 s** | — | — |

Na amostra 2 a curva já estava montada (após buscar a cobrança) e o endereço veio do celular, por
isso o total caiu de 56 s para 22 s. As etapas de cálculo variaram menos de 4 % entre as amostras;
mediana e p95 exigem mais repetições.

- **H1 (secp256k1 sem `BigInt` é viável): confirmada**, com a assinatura aceita pelo servidor.
- **H2 (assinatura em menos de 10 s): refutada com o `elliptic` sem otimizações.** Só o `sign`
  leva ~21 s. Uma implementação própria (tabelas pré-montadas em limbs) fica como próximo passo.
- **H5 (hash EIP-712 barato no relógio): confirmada** (0,17–0,19 s).
- Correção: o código do relógio, executado no Node contra o `viem`, produziu digest, assinatura
  (byte a byte) e endereço recuperado idênticos em 300 casos aleatórios, incluindo `value = 2^256 − 1`.

## Arquitetura do teste

```
Relógio                          Celular (app Zepp)                Servidor
[Buscar cobrança] ─────BLE─────▶ Side Service ──────HTTPS──────▶ GET /invoice → typedData EIP-712
 mostra valor/destinatário/prazo ◀─────────────────────────────── (nonce aleatório, validade 300 s)
[Assinar] ── pede a chave ─────▶ chave de teste + endereço
 hash EIP-712 → curva → assinatura (r, s, v) na tela              POST /validate → veredito na tela
```

O domínio EIP-712 (nome, versão, `chainId`, contrato) é **fixo no app do relógio**; uma cobrança
com domínio diferente é recusada.

## Decisões

| Decisão | Motivo |
|---|---|
| Usar o tipo real `TransferWithAuthorization` desde o início | Mesma complexidade no relógio; nada a refazer na fase de pagamento |
| Domínio EIP-712 fixo no relógio | O celular é um canal não confiável |
| Testar bibliotecas prontas (`elliptic`, `js-sha3`, `bn.js`) antes de implementar à mão | Medir viabilidade e custo rapidamente |
| **Fase de teste:** chave digitada no celular e entregue ao relógio | Testar a assinatura antes de resolver geração e guarda da chave no relógio |
| **Fase de teste:** endereço calculado no celular | No relógio custou 19,6 s; um endereço falso só causa negação de serviço (a assinatura continua sendo da chave do relógio e o contrato recusa um `from` errado) |
| Reaproveitar a curva montada na sessão | A curva e as tabelas do ponto gerador são públicas; segredos (chave, nonce `k`) não são reaproveitados |
| Migalhas em arquivo antes de cada etapa | Se o relógio reiniciar, a próxima abertura mostra em que etapa parou |

## Descobertas sobre a plataforma

### 1. Cálculo longo parece travamento

Durante ~35–55 s de cálculo síncrono o app não devolve o controle ao sistema: a **tela apaga** pelo
tempo normal de inatividade e não pode ser reacesa, o que parece um crash. Mitigação: manter a tela
acesa durante a assinatura (`setPageBrightTime`, `pauseDropWristScreenOff`) e avisar o usuário
para não tocar no relógio. Em uma ocorrência o relógio reiniciou durante a derivação do endereço; a
causa não foi confirmada (hipótese: botão pressionado longamente para tentar acender a tela).

### 2. Não há watchdog de ~10 s por bloco síncrono

Etapas de até 21,6 s contínuos terminaram sem interrupção. Fatiar o cálculo com `setTimeout`
continua útil para a interface, mas não foi necessário para concluir a assinatura.

### 3. Bignum é muito mais lento que AES/SHA no relógio

A Fase 1 indicava o relógio ~185x mais lento que o QuickJS no desktop (AES/SHA de 32 bits). Para a
aritmética de 256 bits do `bn.js` o fator real foi **400–700x**. Estimativas de desempenho precisam
usar o fator do tipo de operação.

### 4. Montar a curva custa caro, mas uma vez por sessão

`new EC('secp256k1')` converte as tabelas pré-computadas do `elliptic` de texto hexadecimal para
números grandes (13,6 s). A biblioteca guarda a curva montada, então só a primeira assinatura de
cada abertura do app paga esse custo.

### 5. Empacotamento e runtime

- O Rollup do Zeus não importa JSON: a raiz do `elliptic` (`require('../package.json')`) quebra o
  build; importar os submódulos `ec` e `utils` diretamente resolve.
- A página com `BasePage` (ZML) exige `BaseApp` no `app.js`; sem isso a tela fica em branco.
- O `fetch` do app Zepp no iOS exige o esquema (`https://`) na URL.
- No QuickJS, o pico de memória do fluxo é o carregamento das bibliotecas (~335 KB); a assinatura
  acrescenta ~60 KB.

### 6. Logs do app Zepp expõem configurações

O app Zepp registra no log de depuração os valores das configurações do mini app em texto claro.
Qualquer segredo digitado nas configurações (como a chave de teste desta fase) deve ser considerado
exposto. Reforça a decisão de, na versão final, gerar e guardar a chave apenas no relógio.

## Mudanças após as medições (24 nov. 2026)

- **Curva montada uma única vez por sessão**, logo após buscar a cobrança (com a tela acesa), e
  reaproveitada nas assinaturas: o tempo de assinar cai para o do `sign` (~22 s).
- **`from` e `to` na rota `/invoice`**: o relógio envia o endereço da própria carteira como `from`
  e um endereço genérico de teste como `to`; parâmetros inválidos são recusados pelo servidor.
- **O endereço é obtido sem a chave** (`address.get`); a chave só trafega na hora de assinar.
- **Validação no servidor:** depois de assinar, o relógio envia endereço, transação (com o domínio
  que ele usou) e assinatura para `POST /validate`, que confere com o `viem` (independente do código
  do relógio) e devolve o veredito exibido na tela.

## Próximos passos

- Avisar o usuário ao terminar (vibração) e montar a curva a partir de tabelas pré-convertidas na build.
- Repetir as medições (≥ 10 amostras: mediana e p95) e medir memória no aparelho.
- Implementação própria de secp256k1 para tentar atingir H2 (< 10 s).
- Geração e guarda da chave no relógio (endereço calculado uma vez, na geração).
