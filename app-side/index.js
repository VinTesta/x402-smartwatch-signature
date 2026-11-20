// Side Service (roda dentro do Zepp App no celular).
// Papel: só transporte. Recebe o relatório/envelope do relógio e faz POST no servidor.
// Não conhece nenhuma chave: decifrar é trabalho do servidor.
import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'
import { DEFAULT_SERVER_URL, SETTINGS_KEY_URL } from '../shared/config.js'

function serverUrl() {
  const fromSettings = settingsLib.getItem(SETTINGS_KEY_URL)
  return (fromSettings && String(fromSettings).trim()) || DEFAULT_SERVER_URL
}

function parseBody(body) {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch (e) {
    return body
  }
}

async function forward(kind, payload) {
  const url = serverUrl()
  const envelope = { kind, payload, side: { receivedAt: new Date().toISOString() } }

  // Sempre loga: com o `zeus bridge` dá para copiar o JSON e decifrar localmente
  // (tools/aes-reference.cjs), mesmo sem servidor configurado.
  console.log('[side] ' + kind + ' -> ' + (url || '(sem URL)'))
  console.log('[side] envelope ' + JSON.stringify(envelope))

  if (!url) {
    return { forwarded: false, reason: 'URL do servidor não configurada (Settings App)' }
  }

  const t0 = Date.now()
  const res = await fetch({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Title: 'zepp-' + kind },
    body: JSON.stringify(envelope),
  })
  const out = { forwarded: true, status: res.status, ms: Date.now() - t0, body: parseBody(res.body) }
  console.log('[side] resposta ' + JSON.stringify(out))
  return out
}

AppSideService(
  BaseSideService({
    onInit() {
      console.log('[side] init, servidor = ' + (serverUrl() || '(não configurado)'))
    },

    onRequest(req, res) {
      if (req.method !== 'forward') {
        res('método desconhecido: ' + req.method)
        return
      }
      const { kind, payload } = req.params || {}
      forward(kind, payload)
        .then((out) => res(null, out))
        .catch((e) => {
          console.log('[side] erro no fetch: ' + String((e && e.message) || e))
          res(null, { forwarded: false, reason: 'fetch falhou: ' + String((e && e.message) || e) })
        })
    },

    onSettingsChange({ key, newValue }) {
      console.log('[side] settings ' + key + ' = ' + newValue)
    },

    onRun() {},
    onDestroy() {},
  })
)
