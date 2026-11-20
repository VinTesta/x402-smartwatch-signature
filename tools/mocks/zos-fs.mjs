// Mock do @zos/fs: arquivos num diretório real (ZOS_FS_DIR), para sobreviver ao
// "reboot" simulado (o processo Node é encerrado e outro é aberto com o mesmo diretório).
import fs from 'node:fs'
import path from 'node:path'

const dir = () => {
  const d = process.env.ZOS_FS_DIR
  if (!d) throw new Error('ZOS_FS_DIR não definido')
  fs.mkdirSync(d, { recursive: true })
  return d
}

export function readFileSync({ path: p }) {
  const f = path.join(dir(), p)
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : undefined
}

export function writeFileSync({ path: p, data }) {
  fs.writeFileSync(path.join(dir(), p), data)
}
