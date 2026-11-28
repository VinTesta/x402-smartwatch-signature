import * as hmUI from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { px } from '@zos/utils'

const info = getDeviceInfo()
export const DEVICE_WIDTH = info.width
export const DEVICE_HEIGHT = info.height

// Telas redondas perdem os cantos: margem lateral maior.
const SIDE = info.screenShape === SCREEN_SHAPE_ROUND ? px(70) : px(20)
const CONTENT_W = DEVICE_WIDTH - 2 * SIDE

export const COLORS = {
  primary: 0x2f6fde,
  pressed: 0x1b4594,
  sign: 0x1f9d55,
  signPressed: 0x13693a,
  text: 0xffffff,
  muted: 0xa0a0a0,
}

export const TITLE = {
  x: SIDE,
  y: px(14),
  w: CONTENT_W,
  h: px(44),
  color: COLORS.text,
  text_size: px(30),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text: 'Cobrança x402',
}

export const BUTTON_COUNT = 2
const BTN_Y0 = px(66)
const BTN_H = px(58)
const BTN_GAP = px(12)

export function buttonStyle(index, text, variant) {
  const sign = variant === 'sign'
  return {
    x: SIDE,
    y: BTN_Y0 + index * (BTN_H + BTN_GAP),
    w: CONTENT_W,
    h: BTN_H,
    radius: px(14),
    text_size: px(26),
    normal_color: sign ? COLORS.sign : COLORS.primary,
    press_color: sign ? COLORS.signPressed : COLORS.pressed,
    text,
  }
}

const AFTER_BUTTONS = BTN_Y0 + BUTTON_COUNT * (BTN_H + BTN_GAP)

export const STATUS = {
  x: SIDE,
  y: AFTER_BUTTONS,
  w: CONTENT_W,
  h: px(60),
  color: COLORS.muted,
  text_size: px(22),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
  text: 'Toque em "Buscar cobrança".',
}

// Corpo da transação. Área alta: a página rola quando o conteúdo passa da tela.
export const BODY = {
  x: SIDE,
  y: AFTER_BUTTONS + px(66),
  w: CONTENT_W,
  h: px(1400),
  color: COLORS.text,
  text_size: px(20),
  align_h: hmUI.align.LEFT,
  align_v: hmUI.align.TOP,
  text_style: hmUI.text_style.WRAP,
  text: '(nenhuma cobrança carregada)',
}
