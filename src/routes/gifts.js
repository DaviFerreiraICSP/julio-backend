import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/gifts — lista pública (apenas ativos)
router.get('/', (_req, res) => {
  const gifts = db.prepare(
    'SELECT id, name, category, price, icon, image_url, gifted, gifted_by FROM gifts WHERE active = 1 ORDER BY sort_order, created_at'
  ).all()
  res.json(gifts)
})

// GET /api/gifts/:id
router.get('/:id', (req, res) => {
  const gift = db.prepare(
    'SELECT id, name, category, price, icon, image_url, gifted, gifted_by FROM gifts WHERE id = ? AND active = 1'
  ).get(req.params.id)
  if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' })
  res.json(gift)
})

// POST /api/gifts/:id/claim — convidado confirma que presenteou
router.post('/:id/claim', (req, res) => {
  const { gifted_by } = req.body ?? {}
  const gift = db.prepare('SELECT id, gifted FROM gifts WHERE id = ? AND active = 1').get(req.params.id)
  if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' })
  if (gift.gifted) return res.status(409).json({ error: 'Este presente já foi presenteado.' })
  db.prepare('UPDATE gifts SET gifted = 1, gifted_by = ?, gifted_at = ? WHERE id = ?')
    .run(gifted_by?.trim() || 'Convidado', Date.now(), req.params.id)
  res.json({ ok: true })
})

export default router
