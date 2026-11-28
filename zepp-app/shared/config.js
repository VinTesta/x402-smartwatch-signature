// Configuração compartilhada entre relógio (page/) e celular (app-side/, setting/).

// URL base do invoice-server. Pode ser sobrescrita no Settings App
// (app Zepp > este app > Configurações). Ex.: https://<projeto>.vercel.app
export const DEFAULT_SERVER_URL = ''

// Chaves do settingsStorage (Settings App <-> Side Service).
export const SETTINGS_KEY_URL = 'serverUrl'
export const SETTINGS_KEY_PRIVATE_KEY = 'privateKey'

// Rota do servidor que devolve o corpo da cobrança.
export const INVOICE_PATH = '/invoice'
// Rota do servidor que valida a assinatura (POST, com viem).
export const VALIDATE_PATH = '/validate'

// Domínio EIP-712 FIXO no app (USDC na Base Sepolia). O relógio assina sempre com este
// domínio, nunca com o que vem do celular/servidor (canal não confiável).
export const EIP712_DOMAIN = {
  name: 'USDC',
  version: '2',
  chainId: '84532',
  verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}

// Destinatário ("to") genérico de TESTE: conta nº 1 padrão do Hardhat/Anvil (mnemônico público
// "test test ... junk"). A chave privada dela é pública: serve só para testes, nunca para
// receber valor real.
export const TEST_PAY_TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

// Métodos da mensageria relógio <-> Side Service (ZML request/response).
export const METHODS = {
  GET_INVOICE: 'invoice.get', // params: { from, to } (endereços)
  GET_ADDRESS: 'address.get', // só o endereço da carteira (sem a chave)
  GET_PRIVATE_KEY: 'key.get', // chave + endereço (só na hora de assinar)
  VALIDATE: 'signature.validate', // params: { publicKey, transaction, signature } → POST /validate
}
