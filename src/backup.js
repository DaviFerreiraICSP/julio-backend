import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..')
const BACKUP_DIR = join(DATA_DIR, 'backups')
const MAX_BACKUPS = 20
const INTERVAL_MS = 30 * 60 * 1000 // 30 minutos

async function runBackup(db) {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const dest = join(BACKUP_DIR, `wedding_${ts}.db`)
    await db.backup(dest)
    console.log(`[backup] ${dest}`)
    pruneOldBackups()
  } catch (err) {
    console.error('[backup] Falha ao fazer backup:', err.message)
  }
}

function pruneOldBackups() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('wedding_') && f.endsWith('.db'))
      .map(f => ({ name: f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)

    files.slice(MAX_BACKUPS).forEach(f => {
      unlinkSync(join(BACKUP_DIR, f.name))
    })
  } catch (err) {
    console.error('[backup] Falha ao limpar backups antigos:', err.message)
  }
}

export function setupBackups(db) {
  // backup imediato na inicializacao
  runBackup(db)
  // backup periodico a cada 30 minutos
  setInterval(() => runBackup(db), INTERVAL_MS)
}
