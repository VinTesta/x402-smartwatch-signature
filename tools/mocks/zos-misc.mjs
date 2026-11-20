// Mocks mínimos de @zos/device e @zos/settings para o teste no Node.
export const SCREEN_SHAPE_SQUARE = 0
export const SCREEN_SHAPE_ROUND = 1
export function getDeviceInfo() {
  return { width: 390, height: 450, screenShape: 0, deviceName: 'Node mock' }
}
export function getSystemInfo() {
  return { osVersion: 'mock', firmwareVersion: 'mock', minAPI: '4.2' }
}
