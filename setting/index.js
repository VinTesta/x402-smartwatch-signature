// Settings App (página de configuração dentro do Zepp App, no celular).
// Guarda a URL do servidor que o app-side usa para o POST.
import { SETTINGS_KEY_URL } from '../shared/config.js'

AppSettingsPage({
  build(props) {
    const current = props.settingsStorage.getItem(SETTINGS_KEY_URL) || ''

    return View({ style: { padding: '12px 20px' } }, [
      TextInput({
        label: 'URL do servidor (POST)',
        placeholder: 'https://seu-projeto.vercel.app/',
        value: current,
        maxLength: 300,
        subStyle: { color: '#333', fontSize: '14px' },
        onChange: (val) => {
          props.settingsStorage.setItem(SETTINGS_KEY_URL, String(val || '').trim())
        },
      }),
      Button({
        label: 'Limpar URL',
        style: { fontSize: '12px', borderRadius: '30px', background: '#D85E33', color: 'white', marginTop: '12px' },
        onClick: () => {
          props.settingsStorage.setItem(SETTINGS_KEY_URL, '')
        },
      }),
    ])
  },
})
