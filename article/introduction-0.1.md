# 1. Introdução
Esse artigo tem como objetivo explorar a implementação do protocolo de assinatura x402 [referencia] em um relógio inteligente Bip 6 da marca amazfit [referencia]. O protocolo x402 foi criado por pesquisadores e desenvolvedores da Coinbase [referencia] com o objetivo de desbloquear uma camada de pagamentos agenticos na intenete. O foco foi criar uma protocolo que explora-se o código de retorno HTTP 402 Payment Required [referencia], que foi introduzido anos atrás, porém, nunca teve um uso real na internet até os dias de hoje. O x402 traz com sigo um SDK completo com o objetivo de ser Make It Yourself, onde o prestador de um serviço pode implementar um middleware de pagamentos x402 simples e rápido. Além disso, diversas bibliotecas para diferentes ecossistemas de blockchain e diferentes redes como Ethereum [referencia], Solana [referencia], Stellar [referencia] e tantas outras já trazem consigo SDK de assinatura e implementação de pagamento com o x402.

A ideia desse artigo é discutir e sugerir uma implementação simples de assinatura em um smartwatch com sistema operacional Zepp OS [refencia] simples que contem um compilador para JS básico sem funções e tipos como BigInt [referencia]. Hoje em dia a maior parte das bibliotecas de criptografia modernas para JS como noble [referencia] e [adicionar mais um exemplo] usam o BigInt para representar números de até 256 bits, muito usados nos algoritmos de criptografia modernos.

O artigo conta com esse paper com demonstração de materiais, métodos e resultados e um repositório open-source para que outros pesquisadores e desenvolvedores construam suas próprias carteiras e soluções usando esse trabalho como ponto de partida.

# 2. Materiais de Métodos

## 2.1. Materiais
[Adicionar todos os materiais aqui]

## 2.2. Métodos
Vamos produzir um sistema com arquitetura de 2 pontas e um intermediário, sendo as pontas o smartwatch responsável pelo resumo, coleta de aprovação do usuário e assinatura da transação com a chave privada, e um servidor http hospedado na nuvem com um middleware de validação de assinatura. O intermediário é um smartphone com aplicativo Zepp, conexão wifi e bluetooth conectado ao relógio para fazer a comunicação com o servidor de cobrança do recurso.


