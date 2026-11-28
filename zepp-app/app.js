// BaseApp cria o canal de mensagens (globalData.messaging) que o BasePage da página
// usa para this.request(). Sem ele, o onInit da página quebra e nada aparece na tela.
import { BaseApp } from '@zeppos/zml/base-app'

App(
  BaseApp({
    globalData: {},
    onCreate() {
      console.log('app on create invoke')
    },
    onDestroy() {
      console.log('app on destroy invoke')
    },
  })
)
