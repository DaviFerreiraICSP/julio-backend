import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

const router = Router()

// GET /api/messages?limit=20&offset=0
router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const offset = Number(req.query.offset) || 0

  const messages = db.prepare(
    'SELECT id, name, text, created_at FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset)

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM messages').get()
  res.json({ messages, total, hasMore: offset + limit < total })
})

// POST /api/messages
router.post('/', (req, res) => {
  const { name, text } = req.body ?? {}
  if (!name?.trim() || !text?.trim()) return res.status(400).json({ error: 'Nome e mensagem são obrigatórios.' })
  if (text.length > 500) return res.status(400).json({ error: 'Mensagem muito longa (máx 500 caracteres).' })

  const id = randomUUID()
  db.prepare('INSERT INTO messages (id, name, text) VALUES (?, ?, ?)').run(id, name.trim(), text.trim())
  res.status(201).json({ id, message: 'Mensagem enviada com sucesso!' })
})

export default router
