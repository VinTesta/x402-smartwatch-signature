// Settings App (página de configuração dentro do app Zepp, no celular).
// Guarda a URL do invoice-server e a chave privada de TESTE usada pelo relógio.
import { SETTINGS_KEY_URL, SETTINGS_KEY_PRIVATE_KEY } from '../shared/config.js'
import { addressFromPrivateKey } from '../shared/eth-address.js'

const LABEL_STYLE = { fontSize: '13px', color: '#666', marginTop: '16px' }
const INPUT_SUBSTYLE = { color: '#333', fontSize: '14px' }
const DANGER_BUTTON = {
  fontSize: '12px',
  borderRadius: '30px',
  background: '#D85E33',
  color: 'white',
  marginTop: '8px',
}

function normalizeKey(value) {
  const raw = String(value || '').trim()
  const hex = raw.indexOf('0x') === 0 ? raw.slice(2) : raw
  return { hex, valid: /^[0-9a-fA-F]{64}$/.test(hex) }
}

// Mostra só o começo e o fim da chave salva.
function describeKey(stored) {
  if (!stored) return 'Nenhuma chave salva.'
  const { hex, valid } = normalizeKey(stored)
  if (!valid) return 'Chave salva inválida (esperado 64 caracteres hex).'
  let address
  try {
    address = addressFromPrivateKey(hex)
  } catch (e) {
    address = '(erro ao derivar: ' + String((e && e.message) || e) + ')'
  }
  return 'Chave salva: 0x' + hex.slice(0, 4) + '…' + hex.slice(-4) + '\nEndereço (use no PAYER_ADDRESS): ' + address
}

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const url = storage.getItem(SETTINGS_KEY_URL) || ''
    const key = storage.getItem(SETTINGS_KEY_PRIVATE_KEY) || ''

    return View({ style: { padding: '12px 20px' } }, [
      TextInput({
        label: 'URL do invoice-server',
        placeholder: 'https://seu-projeto.vercel.app',
        value: url,
        maxLength: 300,
        subStyle: INPUT_SUBSTYLE,
        onChange: (val) => storage.setItem(SETTINGS_KEY_URL, String(val || '').trim()),
      }),

      TextInput({
        label: 'Chave privada (carteira de TESTE, hex)',
        placeholder: '0x + 64 caracteres hex',
        // Não pré-preenche com a chave: só o resumo abaixo aparece na tela.
        value: '',
        maxLength: 66,
        subStyle: INPUT_SUBSTYLE,
        onChange: (val) => {
          const { hex, valid } = normalizeKey(val)
          // Salva só se for válida; o build() roda de novo e o resumo é atualizado.
          if (valid) storage.setItem(SETTINGS_KEY_PRIVATE_KEY, '0x' + hex.toLowerCase())
        },
      }),
      Text({ style: LABEL_STYLE }, describeKey(key)),
      Text(
        { style: LABEL_STYLE },
        'Use só uma carteira de teste sem fundos: a chave fica salva sem proteção no app Zepp.'
      ),

      Button({
        label: 'Apagar chave',
        style: DANGER_BUTTON,
        onClick: () => storage.setItem(SETTINGS_KEY_PRIVATE_KEY, ''),
      }),
      Button({
        label: 'Limpar URL',
        style: DANGER_BUTTON,
        onClick: () => storage.setItem(SETTINGS_KEY_URL, ''),
      }),
    ])
  },
})
