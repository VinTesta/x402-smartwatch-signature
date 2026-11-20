# 5. Dificuldades, erros e lições

Registro honesto do que deu errado e do que mudou por causa disso. Vários desses pontos são resultados por si só, porque descrevem a plataforma, e não apenas o processo.

## 5.1 Da plataforma

### A documentação não corresponde ao aparelho

- A página de suporte a JavaScript diz que `Promise` e timers não existem. No Bip 6 os dois existem, e a própria biblioteca oficial de mensagens (ZML) depende deles.
- O `@zos/crypto` está documentado com exemplos, mas no Bip 6 (fw 4.6.0.3) suas operações devolvem `undefined`. O pacote de tipos oficial nem declara o módulo.
- O módulo exporta duas funções que não aparecem na documentação (`checkAvailable`, `digest`), e as constantes de algoritmo não são enumeráveis. Uma inspeção ingênua (`Object.keys`) conclui erroneamente que elas não existem.

**Lição:** para esta pesquisa, a documentação do Zepp OS é hipótese, não fato. Toda premissa sobre o runtime precisa de um teste no aparelho, e a seção 2.2 da proposta deve citar as medições deste repositório.

### Chamadas nativas podem reiniciar o relógio inteiro

Com o argumento errado (`number[]` no `AES_CBC.encrypt`), a chamada **reinicia o sistema operacional do relógio**: não lança exceção nem fecha só o app. Isso aconteceu duas vezes (E6 e E7).

Consequências:

- Para a pesquisa, o binding nativo não valida a entrada antes de usá-la. Qualquer mini app pode derrubar o relógio, o que também é uma observação de robustez e segurança da plataforma.
- Para a metodologia, testes exploratórios de API nativa precisam de proteção contra crash. Daí o mecanismo de **migalhas** (`utils/crumbs.js`): grava o nome da chamada antes de executá-la e, no próximo boot, identifica e bloqueia a culpada. Funcionou na primeira vez em que foi necessário (E7).

### O simulador não serve para criptografia nativa

O firmware que o simulador executa contém só o esqueleto do módulo `@zos/crypto`, sem as implementações (E8). Somado aos relatos de que o simulador não executa o Side Service (referência [39] da proposta), isso faz com que **todo teste relevante precise ser feito no aparelho**. O ciclo fica lento: instalar pelo `zeus bridge`, tocar nos botões e copiar logs.

**Mitigação:** quase toda a lógica fica em código puro (`shared/`), testado no Node contra OpenSSL e `jose` antes de ir ao relógio, e o código do relógio roda no Node com o `@zos/*` simulado (`npm run devicesim`). Na v4, a primeira ida ao aparelho já funcionou de ponta a ponta.

### Sem `BigInt`, sem `TextEncoder`, sem `atob`

Tudo que normalmente vem pronto foi reimplementado: UTF-8, base64/base64url, hex. É pouco código, mas é necessário. Na Fase 2 isso se repete em escala maior: aritmética de 256 bits sem `BigInt`.

### Fonte de aleatoriedade lenta e não documentada como tal

`getRandomValues` só existe no API_LEVEL 5.0. O substituto encontrado (`createChiper()`) custa ~300 ms por 16 bytes e não é documentado como gerador criptográfico. Por isso o RNG é marcado no relatório (`aes-keygen+sha256` ou `math-random-INSEGURO`). Para a assinatura, o RFC 6979 elimina a necessidade de aleatoriedade.

### Logs volumosos e com dados sensíveis

- O `zeus bridge` registra cada frame BLE em hexadecimal; uma sessão curta gera dezenas de milhares de caracteres.
- Os logs da Vercel incluíam todos os cabeçalhos HTTP, com IP, geolocalização e token OIDC da plataforma.
- A sondagem enviava os endereços MAC e o UUID do relógio.

**Correções:** a sondagem passou a enviar só modelo, firmware e tela, e as evidências deste repositório foram transcritas sem identificadores. Ainda **é recomendável** reduzir o log de cabeçalhos no servidor.

## 5.2 Do processo (erros cometidos)

1. **Confiar na documentação para desenhar o adaptador nativo (v1).** O protocolo da v1 foi feito para contornar o IV não documentado do AES nativo (um "bloco aleatório prefixado"). Com o nativo inutilizável, ele foi descartado e substituído por um formato padrão (JWE), que só é possível quando controlamos o IV.
2. **Diagnóstico exploratório agressivo demais (v2).** Chamar funções não documentadas e vários formatos de uma vez, sem gravar o progresso, causou um reboot sem identificar a causa. A correção (v3) foi usar só a API documentada, ordenar do formato mais seguro para o menos testado e gravar migalhas.
3. **Generalização excessiva do bloqueio (v3).** Depois do crash em `aes.encrypt.arr`, o formato `number[]` foi bloqueado para *todas* as operações. Com isso perdeu-se a chance de saber se SHA-256 e HMAC nativos funcionam com `number[]` (os dois chegaram a ser chamados com esse formato sem crash, mas o resultado se perdeu no reboot). Com a mudança para JS puro isso deixou de importar, mas fica registrado como pergunta aberta.
4. **Erros pegos pelos testes antes de chegar ao relógio:**
   - uma chave de teste com 63 dígitos hexadecimais em vez de 64;
   - a codificação UTF-8 de um *surrogate* solto, que gerava bytes inválidos.

   Os dois mostram o valor da suíte local diante de um ciclo de teste lento no aparelho.
5. **Premissas conceituais do pedido inicial** (AES assimétrico, RSA simétrico, ECDSA como cifragem), corrigidas antes da implementação. Ver [Contexto](01-contexto-e-objetivo.md).

## 5.3 Lições para as próximas fases

- **Não usar API nativa no caminho crítico da assinatura.** A Fase 2 será 100% JS puro, validada byte a byte contra bibliotecas de referência no Node.
- **Toda chamada nativa nova** (por exemplo, testar o `encryptKey` para proteger a chave em repouso) **passa por `nat()`**, com migalha, e é testada isoladamente, uma por versão.
- **Vetores determinísticos são a melhor ferramenta.** O RFC 6979 produz assinaturas determinísticas, então o relógio pode comparar sua assinatura com a da referência byte a byte, como já faz com o token JWE no KAT.
- **Medir no relógio, não estimar.** Os tempos do KAT da v4 ainda faltam e devem ser coletados antes de dimensionar a Fase 2.
- **Fixar a região do servidor e instrumentar os carimbos de tempo** nos três pontos (relógio, Side Service, servidor), conforme o procedimento da proposta.
