import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

const router = Router()

// POST /api/rsvp
router.post('/', (req, res) => {
  const { name, email = '', guests = 0, restrictions = '' } = req.body ?? {}
  if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório.' })

  const id = randomUUID()
  db.prepare(
    'INSERT INTO rsvp (id, name, email, guests, restrictions) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim(), email.trim(), Number(guests), restrictions.trim())

  res.status(201).json({ id, message: 'Presença confirmada com sucesso!' })
})

export default router
