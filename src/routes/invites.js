import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/invites/:id — convidado busca dados do convite
router.get('/:id', (req, res) => {
  const invite = db.prepare(
    'SELECT id, name, max_guests, status FROM invites WHERE id = ?'
  ).get(req.params.id)

  if (!invite) return res.status(404).json({ error: 'Convite nao encontrado.' })
  res.json(invite)
})

// POST /api/invites/:id/confirm — convidado confirma ou recusa presenca
router.post('/:id/confirm', (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(req.params.id)
  if (!invite) return res.status(404).json({ error: 'Convite nao encontrado.' })

  const { confirmed, guests, notes = '' } = req.body ?? {}

  if (typeof confirmed !== 'boolean') {
    return res.status(400).json({ error: 'Campo confirmed (boolean) e obrigatorio.' })
  }

  if (confirmed) {
    const count = Number(guests)
    if (!Number.isInteger(count) || count < 1) {
      return res.status(400).json({ error: 'guests deve ser um inteiro maior que 0.' })
    }
    if (count > invite.max_guests) {
      return res.status(400).json({ error: `Maximo de ${invite.max_guests} convidado(s) para este convite.` })
    }

    db.prepare(
      'UPDATE invites SET status = ?, confirmed_guests = ?, notes = ?, confirmed_at = ? WHERE id = ?'
    ).run('confirmed', count, notes.trim(), Date.now(), invite.id)
  } else {
    db.prepare(
      'UPDATE invites SET status = ?, confirmed_guests = NULL, notes = ?, confirmed_at = ? WHERE id = ?'
    ).run('declined', notes.trim(), Date.now(), invite.id)
  }

  const updated = db.prepare('SELECT id, name, max_guests, status, confirmed_guests FROM invites WHERE id = ?').get(invite.id)
  res.json(updated)
})

export default router
