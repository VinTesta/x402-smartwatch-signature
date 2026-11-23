# invoice-server

Servidor HTTP de cobrança: expõe um recurso protegido por **x402** (responde `402 Payment Required`
com os requisitos de pagamento), valida a assinatura EIP-3009/EIP-712 produzida pelo relógio e
liquida o pagamento via facilitator na Base Sepolia.

Ainda não implementado.
