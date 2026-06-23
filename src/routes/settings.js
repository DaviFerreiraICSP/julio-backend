import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/settings — configurações públicas do site
router.get('/', (_req, res) => {
  const hero = db.prepare('SELECT value FROM settings WHERE key = ?').get('hero_image_url')
  res.json({
    hero_image_url: hero?.value || null,
  })
})

export default router
