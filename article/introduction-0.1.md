# 1. Introdução
Esse artigo tem como objetivo explorar a implementação do protocolo de assinatura x402 [1] em um relógio inteligente Bip 6 da marca amazfit [2]. O protocolo x402 foi criado por pesquisadores e desenvolvedores da Coinbase [3] com o objetivo de desbloquear uma camada de pagamentos agenticos na intenete. O foco foi criar uma protocolo que explora-se o código de retorno HTTP 402 Payment Required [4], que foi introduzido anos atrás, porém, nunca teve um uso real na internet até os dias de hoje. O x402 traz com sigo um SDK completo com o objetivo de ser Make It Yourself, onde o prestador de um serviço pode implementar um middleware de pagamentos x402 simples e rápido. Além disso, diversas bibliotecas para diferentes ecossistemas de blockchain e diferentes redes como Ethereum [5], Solana [6], Stellar [7] e tantas outras já trazem consigo SDK de assinatura e implementação de pagamento com o x402.

A ideia desse artigo é discutir e sugerir uma implementação simples de assinatura em um smartwatch com sistema operacional Zepp OS [8] simples que contem um compilador para JS básico sem funções e tipos como BigInt [9]. Hoje em dia a maior parte das bibliotecas de criptografia modernas para JS como noble [10] e viem [11] usam o BigInt para representar números de até 256 bits, muito usados nos algoritmos de criptografia modernos.

O artigo conta com esse paper com demonstração de materiais, métodos e resultados e um repositório open-source para que outros pesquisadores e desenvolvedores construam suas próprias carteiras e soluções usando esse trabalho como ponto de partida.

# 2. Materiais de Métodos

## 2.1. Materiais
Para os testes foram usados três dispositivos e um conjunto de bibliotecas e ferramentas em JS. Os dispositivos são um smartwatch Amazfit Bip 6 [2], que guarda a chave e faz a assinatura, um smartphone iPhone 16e [12] com o aplicativo Zepp, que faz a ponte com a internet, e um servidor Node.js hospedado na Vercel [13], que gera a cobrança e valida a assinatura.

No relógio a assinatura foi feita em JS puro, sem BigInt, usando as bibliotecas elliptic 6.6.1 [14] para a curva secp256k1 [15] e o ECDSA [16] com nonce determinístico do RFC 6979 [17], bn.js 4.12.5 [18] para os números de 256 bits, representados com Number em blocos (limbs) de 26 bits, e js-sha3 0.9.3 [19] para o Keccak-256 [20]. A mensagem assinada é uma autorização TransferWithAuthorization do EIP-3009 [21] estruturada em EIP-712 [22], com o domínio do contrato do USDC [23] na rede Base Sepolia [24], com `s` baixo seguindo o EIP-2 [25]. A comunicação entre relógio e celular usou a biblioteca ZML 0.0.38 [26] e o build do app foi feito com o Zeus CLI [27] da Zepp, que compila o código com o qjsc do QuickJS [28].

Para validar os resultados fora do relógio foram usados o Node.js 24 [29], a biblioteca viem 2.58.6 [11] (que usa noble [10] por baixo) como verificador independente das assinaturas, e o QuickJS compilado para WebAssembly através do quickjs-emscripten 0.32.0 [30] para medir tempo e memória do fluxo no mesmo motor JS do relógio. Na primeira fase do estudo também foram usados o OpenSSL [31] e a biblioteca jose [32] como referência para os testes de AES [33] e HMAC-SHA256 [34] [35] e do formato JWE [36] [37].
### 2.1.1. Smartwatch
O relógio usado foi um Amazfit Bip 6 [2], lançado em 2025 como um modelo de entrada da marca. O fabricante não divulga o processador nem a quantidade de memória RAM do aparelho. Páginas de varejistas citam 512 MB de RAM e 4 GB de armazenamento [38], mas esses valores não são confirmados pela Amazfit e não foi encontrada nenhuma desmontagem (teardown) do modelo. A única conexão do relógio é o Bluetooth 5.2 (BLE): ele não tem Wi-Fi nem rede celular, então toda comunicação com a internet depende do celular.

Durante os testes o relógio estava com o Zepp OS 5, firmware 4.6.0.3 e API_LEVEL 4.2. Os apps foram compilados com o Zeus CLI 1.10.1 (zpm 3.5.0) [27], que gera bytecode com o qjsc do QuickJS [28] na versão de 2020-07-05, compilado sem suporte a bignum. Por isso, literais como `1n` falham na compilação e no aparelho `typeof BigInt` retorna `undefined`. Também não existem `TextEncoder`, `atob`/`btoa`, `eval` e `getRandomValues`, enquanto `Promise`, `setTimeout`, `Uint8Array`, `DataView` e `Math.imul` existem, mesmo com a documentação do Zepp OS [8] dizendo o contrário sobre `Promise` e timers. A API nativa de criptografia (`@zos/crypto`) devolveu `undefined` para hash, HMAC e AES e, em um dos casos, reiniciou o relógio, então toda a criptografia foi feita em JS puro e a API nativa só foi usada como fonte de aleatoriedade, a cerca de 301 ms para cada 16 bytes.

Como o fabricante não publica os dados de processamento e memória, a capacidade do relógio foi medida nos próprios testes, comparando os mesmos códigos no relógio e no QuickJS rodando em um computador de mesa. Em operações de 32 bits, como AES e SHA-256, o relógio foi cerca de 185 vezes mais lento. Na aritmética de 256 bits do bn.js [18] essa diferença ficou entre 400 e 700 vezes: o hash EIP-712 levou de 0,17 s a 0,19 s, a montagem da curva secp256k1 levou 13,6 s e a assinatura ECDSA cerca de 21 s. Em memória, o pico do fluxo medido no QuickJS foi o carregamento das bibliotecas, de cerca de 335 KB, com mais cerca de 60 KB durante a assinatura, e o fluxo completo rodou no relógio sem falta de memória. O sistema também não interrompeu blocos de cálculo síncronos de até 21,6 s, mas durante esse tempo o app não devolve o controle ao sistema, a tela apaga e os botões não respondem.

### 2.1.2. Smartphone
O smartphone usado foi um iPhone 16e [12], com chip A18 (CPU de 6 núcleos, sendo 2 de desempenho e 4 de eficiência), 8 GB de RAM, Wi-Fi 6 (802.11ax) e Bluetooth 5.3. O aparelho estava com iOS 26.6.1 e o aplicativo Zepp 10.10.5 em modo desenvolvedor, que executa o Side Service do mini app (runtime 4.3.0). O Side Service é o código em JS que roda dentro do app Zepp, recebe as mensagens do relógio por Bluetooth e faz as requisições HTTPS para o servidor. Pelo app Zepp também roda o Settings App, a tela de configurações do mini app no celular, usada para informar a URL do servidor.

### 2.1.3. Servidor
O servidor de cobrança foi publicado como funções serverless em Node.js na Vercel [13], no plano mais simples (Hobby), com a função na região iad1 (Washington, D.C., EUA) e a borda mais próxima do celular em gru1 (São Paulo). Ele expõe duas rotas: `GET /invoice`, que devolve o corpo EIP-712 [22] da autorização TransferWithAuthorization [21] com um nonce aleatório de 32 bytes e validade de 300 segundos, e `POST /validate`, que recebe a assinatura feita pelo relógio e confere com a biblioteca viem [11], de forma independente do código do relógio, se a assinatura é da chave informada, se o signatário é o `from` da cobrança, se o domínio é o mesmo do servidor e se o `s` é baixo [25]. O mesmo servidor também roda localmente com Node.js 24 [29] para os testes automatizados.

### 2.1.4. Conexão e comunicação
A comunicação acontece em dois trechos. Entre o relógio e o celular a conexão é por Bluetooth Low Energy (BLE 5.2 no relógio e 5.3 no celular), usando a biblioteca ZML [26], que troca mensagens em formato JSON sobre o protocolo binário de mensagens do Zepp OS. Cada frame carrega até 3.584 bytes de dados úteis e mensagens maiores são fragmentadas automaticamente (uma mensagem de 4.806 bytes foi entregue íntegra em 2 frames), com timeout padrão de 60 segundos por requisição.

Entre o celular e o servidor a conexão é por HTTPS, com o iPhone conectado a uma rede Wi-Fi 6 doméstica. A latência medida entre o Side Service e o servidor ficou entre 189 ms e 1.238 ms nos testes da primeira fase, sendo a primeira requisição de cada sessão a mais lenta, e o envio da assinatura ao `/validate` levou 622 ms no total, dos quais 262 ms foram do trecho HTTPS.

A rede de blockchain usada como referência é a Base Sepolia [24] (chainId 84532), uma rede de testes da Base, com o contrato do USDC [23] na versão 2 como domínio EIP-712 fixo no app do relógio. Nesta etapa a assinatura é validada pelo servidor e nenhuma transação é enviada para a rede.

O celular é tratado como um canal não confiável: em modo desenvolvedor o app Zepp registra em log todo payload BLE recebido do relógio e todo corpo HTTP enviado ao servidor. Por isso a integridade do pagamento depende só da assinatura feita no relógio e da conferência dos dados na tela dele.

## 2.2. Métodos
Vamos produzir um sistema com arquitetura de 2 pontas e um intermediário, sendo as pontas o smartwatch responsável pelo resumo, coleta de aprovação do usuário e assinatura da transação com a chave privada, e um servidor http hospedado na nuvem com um middleware de validação de assinatura. O intermediário é um smartphone com aplicativo Zepp, conexão wifi e bluetooth conectado ao relógio para fazer a comunicação com o servidor de cobrança do recurso.

O estudo se dividiu em testar os limites do dispositivo para seguir com o método de implementação


# 3. Referências

[1] x402. x402: an open protocol for internet-native payments. Disponível em: https://www.x402.org/. Acesso em: 2026-11-27.

[2] Amazfit. Amazfit Bip 6. Disponível em: https://www.amazfit.com/products/bip-6. Acesso em: 2026-11-27.

[3] Coinbase. x402: repositório de referência do protocolo. GitHub. Disponível em: https://github.com/coinbase/x402. Acesso em: 2026-11-27.

[4] FIELDING, R.; NOTTINGHAM, M.; RESCHKE, J. RFC 9110: HTTP Semantics, seção 15.5.3 (402 Payment Required). IETF, 2022. Disponível em: https://www.rfc-editor.org/rfc/rfc9110#section-15.5.3. Acesso em: 2026-11-27.

[5] Ethereum Foundation. Ethereum. Disponível em: https://ethereum.org/. Acesso em: 2026-11-27.

[6] Solana Foundation. Solana. Disponível em: https://solana.com/. Acesso em: 2026-11-27.

[7] Stellar Development Foundation. Stellar. Disponível em: https://stellar.org/. Acesso em: 2026-11-27.

[8] Zepp Health. Documentação do Zepp OS. Disponível em: https://docs.zepp.com/. Acesso em: 2026-11-27.

[9] Ecma International. ECMA-262, 11ª edição: ECMAScript 2020 Language Specification (tipo BigInt). 2020. Disponível em: https://262.ecma-international.org/11.0/. Acesso em: 2026-11-27.

[10] MILLER, P. noble-curves e noble-hashes. GitHub. Disponível em: https://github.com/paulmillr/noble-curves. Acesso em: 2026-11-27.

[11] wevm. viem: TypeScript interface for Ethereum. GitHub. Disponível em: https://github.com/wevm/viem. Acesso em: 2026-11-27.

[12] Apple. iPhone 16e: especificações técnicas. Disponível em: https://www.apple.com/iphone-16e/specs/. Acesso em: 2026-11-27.

[13] Vercel. Vercel Functions. Disponível em: https://vercel.com/docs/functions. Acesso em: 2026-11-27.

[14] INDUTNY, F. elliptic: fast elliptic-curve cryptography in plain JavaScript. GitHub. Disponível em: https://github.com/indutny/elliptic. Acesso em: 2026-11-27.

[15] Certicom Research. SEC 2: Recommended Elliptic Curve Domain Parameters, versão 2.0. 2010. Disponível em: https://www.secg.org/sec2-v2.pdf. Acesso em: 2026-11-27.

[16] Certicom Research. SEC 1: Elliptic Curve Cryptography, versão 2.0. 2009. Disponível em: https://www.secg.org/sec1-v2.pdf. Acesso em: 2026-11-27.

[17] PORNIN, T. RFC 6979: Deterministic Usage of the Digital Signature Algorithm (DSA) and Elliptic Curve Digital Signature Algorithm (ECDSA). IETF, 2013. Disponível em: https://www.rfc-editor.org/rfc/rfc6979. Acesso em: 2026-11-27.

[18] INDUTNY, F. bn.js: BigNum in pure JavaScript. GitHub. Disponível em: https://github.com/indutny/bn.js. Acesso em: 2026-11-27.

[19] CHEN, Y.-C. (emn178). js-sha3. GitHub. Disponível em: https://github.com/emn178/js-sha3. Acesso em: 2026-11-27.

[20] NIST. FIPS 202: SHA-3 Standard: Permutation-Based Hash and Extendable-Output Functions. 2015. Disponível em: https://csrc.nist.gov/pubs/fips/202/final. Acesso em: 2026-11-27.

[21] KIM, P. J.; BRITZ, K.; KNOTT, D. EIP-3009: Transfer With Authorization. Ethereum Improvement Proposals, 2020. Disponível em: https://eips.ethereum.org/EIPS/eip-3009. Acesso em: 2026-11-27.

[22] BLOEMEN, R.; LOGVINOV, L.; EVANS, J. EIP-712: Typed structured data hashing and signing. Ethereum Improvement Proposals, 2017. Disponível em: https://eips.ethereum.org/EIPS/eip-712. Acesso em: 2026-11-27.

[23] Circle. USDC Contract Addresses. Disponível em: https://developers.circle.com/stablecoins/usdc-contract-addresses. Acesso em: 2026-11-27.

[24] Base. Documentação da rede Base. Disponível em: https://docs.base.org/. Acesso em: 2026-11-27.

[25] BUTERIN, V. EIP-2: Homestead Hard-fork Changes. Ethereum Improvement Proposals, 2015. Disponível em: https://eips.ethereum.org/EIPS/eip-2. Acesso em: 2026-11-27.

[26] Zepp Health. ZML: Zepp OS Mini-program Library. GitHub. Disponível em: https://github.com/zepp-health/zml. Acesso em: 2026-11-27.

[27] Zepp Health. Zeus CLI. Documentação do Zepp OS. Disponível em: https://docs.zepp.com/. Acesso em: 2026-11-27.

[28] BELLARD, F. QuickJS Javascript Engine. Disponível em: https://bellard.org/quickjs/. Acesso em: 2026-11-27.

[29] OpenJS Foundation. Node.js. Disponível em: https://nodejs.org/. Acesso em: 2026-11-27.

[30] TETON-LANDIS, J. quickjs-emscripten. GitHub. Disponível em: https://github.com/justjake/quickjs-emscripten. Acesso em: 2026-11-27.

[31] OpenSSL Project. OpenSSL. Disponível em: https://www.openssl.org/. Acesso em: 2026-11-27.

[32] SKOKAN, F. jose. GitHub. Disponível em: https://github.com/panva/jose. Acesso em: 2026-11-27.

[33] NIST. FIPS 197: Advanced Encryption Standard (AES). 2001. Disponível em: https://csrc.nist.gov/pubs/fips/197/final. Acesso em: 2026-11-27.

[34] KRAWCZYK, H.; BELLARE, M.; CANETTI, R. RFC 2104: HMAC: Keyed-Hashing for Message Authentication. IETF, 1997. Disponível em: https://www.rfc-editor.org/rfc/rfc2104. Acesso em: 2026-11-27.

[35] NIST. FIPS 180-4: Secure Hash Standard (SHS). 2015. Disponível em: https://csrc.nist.gov/pubs/fips/180-4/upd1/final. Acesso em: 2026-11-27.

[36] JONES, M.; HILDEBRAND, J. RFC 7516: JSON Web Encryption (JWE). IETF, 2015. Disponível em: https://www.rfc-editor.org/rfc/rfc7516. Acesso em: 2026-11-27.

[37] JONES, M. RFC 7518: JSON Web Algorithms (JWA), seção 5.2.2 (A128CBC-HS256). IETF, 2015. Disponível em: https://www.rfc-editor.org/rfc/rfc7518#section-5.2.2. Acesso em: 2026-11-27.

[38] newmobile. Amazfit Bip 6: Specifications. Disponível em: https://www.newmobile.com/smartwatches/amazfit/bip-6/specifications. Acesso em: 2026-11-27.
