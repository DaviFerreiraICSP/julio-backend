import { Router } from 'express'
import multer from 'multer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unlink } from 'fs/promises'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const upload = multer({
  storage: multer.diskStorage({
    destination: join(__dirname, '..', '..', 'uploads', 'pix'),
    filename: (_req, file, _cb) => _cb(null, 'qrcode.png'),
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true)
    else cb(new Error('Apenas imagens sao permitidas.'))
  },
})

const router = Router()

// GET /api/pix  — publico
router.get('/', (_req, res) => {
  const key = db.prepare('SELECT value FROM settings WHERE key = ?').get('pix_key')
  const qr  = db.prepare('SELECT value FROM settings WHERE key = ?').get('pix_qr_url')
  res.json({
    pix_key: key?.value || null,
    pix_qr_url: qr?.value || null,
  })
})

// POST /api/pix/key  — salva chave Pix (admin)
router.post('/key', requireAdmin, (req, res) => {
  const { pix_key } = req.body ?? {}
  if (!pix_key) return res.status(400).json({ error: 'Chave Pix obrigatoria.' })
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('pix_key', pix_key.trim())
  res.json({ ok: true })
})

// POST /api/pix/qr  — faz upload do QR code (admin)
router.post('/qr', requireAdmin, upload.single('qr'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' })
  const url = '/uploads/pix/qrcode.png'
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('pix_qr_url', url)
  res.json({ pix_qr_url: url })
})

// DELETE /api/pix/qr  — remove QR code (admin)
router.delete('/qr', requireAdmin, async (_req, res) => {
  const filePath = join(__dirname, '..', '..', 'uploads', 'pix', 'qrcode.png')
  unlink(filePath).catch(() => {})
  db.prepare('DELETE FROM settings WHERE key = ?').run('pix_qr_url')
  res.json({ ok: true })
})

export default router
