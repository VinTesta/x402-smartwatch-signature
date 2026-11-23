# Instruções para o Claude

## Contexto do projeto: `.project-context/`

Este repositório tem uma pasta **local e não versionada** (`.project-context/`, no `.gitignore`)
com todo o contexto acumulado da pesquisa: proposta, decisões, relatório completo da Fase 1,
evidências brutas e snapshots do código dos repositórios anteriores.

- **Antes de qualquer tarefa não trivial, leia `.project-context/INDEX.md`** e abra só os
  arquivos relevantes a partir dele.
- **Mantenha a pasta atualizada.** Ao concluir um experimento, tomar uma decisão de projeto ou
  descobrir uma limitação nova, registre em `.project-context/` (crie o arquivo ou atualize o
  existente) e adicione a entrada no `INDEX.md`, com data absoluta.
- O que está em `.project-context/fase-1/codigo/` e `fase-1/servidor/` é **snapshot de referência**:
  não edite; copie o que precisar para a parte correspondente do repositório.
- Nada de `.project-context/` deve ser commitado ou citado como link no artigo. O que precisar ser
  público vai para `docs/` ou `article/`, **sem identificadores** (MAC, UUID, serial, IP,
  geolocalização, tokens, chaves reais).
- Se `.project-context/` não existir (clone novo), avise o usuário e use `docs/` e os READMEs.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `article/` | O artigo, versionado (Markdown, em português) |
| `invoice-server/` | Servidor de cobrança HTTP com middleware x402 |
| `zepp-app/` | Mini app Zepp OS: Device App (relógio), Side Service e Settings App (celular) |
| `docs/` | Documentação pública de apoio (ex.: `fase-1-resultados-e-limitacoes.md`) |

## Restrições técnicas que não podem ser esquecidas

- O relógio (Amazfit Bip 6, API_LEVEL 4.2) roda QuickJS **sem `BigInt`**: nada de literais `1n`
  nem bibliotecas `@noble/*` no código do relógio. Aritmética grande com `Number` em limbs.
- **Não usar `@zos/crypto`** para cifra, hash ou assinatura: devolve `undefined` e, com `number[]`,
  reinicia o relógio. Toda chamada nativa nova passa pelo mecanismo de migalhas e é testada isolada.
- Sem `TextEncoder`, `atob`/`btoa`, `eval`, `getRandomValues`. `Promise` e `setTimeout` existem.
- O simulador não executa criptografia nativa nem o Side Service: valide no Node (testes contra
  bibliotecas de referência) antes de ir ao aparelho.
- O celular é canal não confiável: a integridade vem só da assinatura e da conferência no relógio.
  O domínio EIP-712 é fixo no app do relógio.

## Convenções

- Documentação e artigo em português.
- Datas sempre absolutas (ex.: 2026-11-23).
