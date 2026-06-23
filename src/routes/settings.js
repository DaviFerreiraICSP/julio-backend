import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /api/settings — configurações públicas do site
router.get('/', (_req, res) => {
  const hero = db.prepare('SELECT value FROM settings WHERE key = ?').get('hero_image_url')
  const casal = db.prepare('SELECT value FROM settings WHERE key = ?').get('casal_image_url')
  const textsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('site_texts')

  let site_texts = null
  if (textsRow?.value) {
    try { site_texts = JSON.parse(textsRow.value) } catch { /* ignora */ }
  }

  res.json({
    hero_image_url: hero?.value || null,
    casal_image_url: casal?.value || null,
    site_texts,
  })
})

export default router
