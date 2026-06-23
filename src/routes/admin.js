import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import { unlink } from 'fs/promises'
import db from '../db.js'
import { requireAdmin, requireDev } from '../middleware/auth.js'
import { refreshPasswordHash } from '../config.js'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', '..')
const upload = multer({
  storage: multer.diskStorage({
    destination: join(DATA_DIR, 'uploads', 'gifts'),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${randomUUID().slice(0, 8)}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true)
    else cb(new Error('Apenas imagens são permitidas.'))
  },
})

const router = Router()

function createMailer() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

// POST /api/admin/request-reset
router.post('/request-reset', async (req, res) => {
  const { email } = req.body ?? {}
  if (!email) return res.status(400).json({ error: 'Email obrigatorio.' })

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.trim().toLowerCase())
  if (!user) return res.json({ ok: true })

  const token = randomUUID().replace(/-/g, '')
  const expires = Date.now() + 60 * 60 * 1000
  db.prepare('DELETE FROM password_resets WHERE used = 1 OR expires_at < ?').run(Date.now())
  db.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires)

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/reset/${token}`

  const mailer = createMailer()
  if (mailer) {
    await mailer.sendMail({
      from: `"Site do Casamento" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Recuperacao de senha - Painel T&J',
      html: `
        <p>Voce solicitou a recuperacao de senha do painel administrativo.</p>
        <p><a href="${resetUrl}">Clique aqui para redefinir sua senha</a></p>
        <p>Este link expira em 1 hora.</p>
        <p>Se nao foi voce, ignore este email.</p>
      `,
    }).catch(err => console.error('Erro ao enviar email:', err))
  } else {
    console.log(`\n[RESET] Link de recuperacao para ${user.email}:\n${resetUrl}\n`)
  }

  res.json({ ok: true })
})

// POST /api/admin/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body ?? {}
  if (!token || !password) return res.status(400).json({ error: 'Token e senha obrigatorios.' })
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' })

  const reset = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token)
  if (!reset || reset.expires_at < Date.now()) {
    return res.status(400).json({ error: 'Link invalido ou expirado.' })
  }

  const hash = await bcrypt.hash(password, 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, reset.user_id)
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token)

  res.json({ ok: true })
})

// --- Gerenciamento de usuarios (apenas dev) ---

// GET /api/admin/users
router.get('/users', requireDev, (_req, res) => {
  const users = db.prepare('SELECT id, email, role, active, created_at FROM users ORDER BY created_at').all()
  res.json(users)
})

// POST /api/admin/users
router.post('/users', requireDev, async (req, res) => {
  const { email, password, role = 'admin' } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatorios.' })
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' })
  if (!['admin', 'dev'].includes(role)) return res.status(400).json({ error: 'Role invalido.' })

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (exists) return res.status(409).json({ error: 'Este email ja esta cadastrado.' })

  const id = 'user_' + randomUUID().replace(/-/g, '').slice(0, 8)
  const hash = await bcrypt.hash(password, 10)
  db.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)').run(id, email.trim().toLowerCase(), hash, role)
  res.status(201).json(db.prepare('SELECT id, email, role, active, created_at FROM users WHERE id = ?').get(id))
})

// PUT /api/admin/users/:id/toggle
router.put('/users/:id/toggle', requireDev, (req, res) => {
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' })
  if (user.role === 'dev') return res.status(400).json({ error: 'Nao e possivel desativar o dev.' })
  db.prepare('UPDATE users SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id)
  res.json(db.prepare('SELECT id, email, role, active, created_at FROM users WHERE id = ?').get(req.params.id))
})

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireDev, (req, res) => {
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado.' })
  if (user.role === 'dev') return res.status(400).json({ error: 'Nao e possivel remover o dev.' })
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { username: email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatorios.' })

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.trim().toLowerCase())
  if (!user) return res.status(401).json({ error: 'Credenciais invalidas.' })

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Credenciais invalidas.' })

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' })
  res.json({ token, role: user.role })
})

// --- Tudo abaixo requer autenticação ---

// GET /api/admin/gifts
router.get('/gifts', requireAdmin, (_req, res) => {
  const gifts = db.prepare('SELECT * FROM gifts ORDER BY sort_order, created_at').all()
  res.json(gifts)
})

// POST /api/admin/gifts
router.post('/gifts', requireAdmin, (req, res) => {
  const { name, category, price, icon, sort_order = 0 } = req.body ?? {}
  if (!name || !category || price == null) return res.status(400).json({ error: 'name, category e price são obrigatórios.' })

  const id = 'gift_' + randomUUID().replace(/-/g, '').slice(0, 8)
  db.prepare(
    'INSERT INTO gifts (id, name, category, price, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name.trim(), category.trim(), Number(price), icon?.trim() || 'fa-gift', Number(sort_order))

  res.status(201).json(db.prepare('SELECT * FROM gifts WHERE id = ?').get(id))
})

// PUT /api/admin/gifts/:id
router.put('/gifts/:id', requireAdmin, (req, res) => {
  const { name, category, price, icon, sort_order, active } = req.body ?? {}
  const gift = db.prepare('SELECT id FROM gifts WHERE id = ?').get(req.params.id)
  if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' })

  const fields = []
  const values = []

  if (name != null)       { fields.push('name = ?');       values.push(name.trim()) }
  if (category != null)   { fields.push('category = ?');   values.push(category.trim()) }
  if (price != null)      { fields.push('price = ?');       values.push(Number(price)) }
  if (icon != null)       { fields.push('icon = ?');        values.push(icon.trim()) }
  if (sort_order != null) { fields.push('sort_order = ?');  values.push(Number(sort_order)) }
  if (active != null)     { fields.push('active = ?');      values.push(active ? 1 : 0) }

  if (!fields.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' })

  values.push(req.params.id)
  db.prepare(`UPDATE gifts SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  res.json(db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id))
})

// DELETE /api/admin/gifts/:id
router.delete('/gifts/:id', requireAdmin, (req, res) => {
  const gift = db.prepare('SELECT id FROM gifts WHERE id = ?').get(req.params.id)
  if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' })
  db.prepare('DELETE FROM gifts WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// PUT /api/admin/gifts/:id/release — desfaz presenteado
router.put('/gifts/:id/release', requireAdmin, (req, res) => {
  db.prepare('UPDATE gifts SET gifted = 0, gifted_by = NULL, gifted_at = NULL WHERE id = ?').run(req.params.id)
  res.json(db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id))
})

// PUT /api/admin/gifts/:id/mark-gifted — marca manualmente como presenteado
router.put('/gifts/:id/mark-gifted', requireAdmin, (req, res) => {
  const { gifted_by } = req.body ?? {}
  db.prepare('UPDATE gifts SET gifted = 1, gifted_by = ?, gifted_at = ? WHERE id = ?')
    .run(gifted_by || 'Admin', Date.now(), req.params.id)
  res.json(db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id))
})

// POST /api/admin/gifts/:id/image
router.post('/gifts/:id/image', requireAdmin, upload.single('image'), async (req, res) => {
  const gift = db.prepare('SELECT id, image_url FROM gifts WHERE id = ?').get(req.params.id)
  if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' })
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' })

  if (gift.image_url) {
    const oldPath = join(DATA_DIR, gift.image_url.replace(/^\//, ''))
    unlink(oldPath).catch(() => {})
  }

  const imageUrl = `/uploads/gifts/${req.file.filename}`
  db.prepare('UPDATE gifts SET image_url = ? WHERE id = ?').run(imageUrl, req.params.id)
  res.json(db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id))
})

// DELETE /api/admin/gifts/:id/image
router.delete('/gifts/:id/image', requireAdmin, async (req, res) => {
  const gift = db.prepare('SELECT id, image_url FROM gifts WHERE id = ?').get(req.params.id)
  if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' })

  if (gift.image_url) {
    const filePath = join(DATA_DIR, gift.image_url.replace(/^\//, ''))
    unlink(filePath).catch(() => {})
  }

  db.prepare('UPDATE gifts SET image_url = NULL WHERE id = ?').run(req.params.id)
  res.json(db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id))
})

// GET /api/admin/rsvp
router.get('/rsvp', requireAdmin, (_req, res) => {
  const list = db.prepare('SELECT * FROM rsvp ORDER BY created_at DESC').all()
  const totalGuests = list.reduce((s, r) => s + r.guests, 0)
  res.json({ list, summary: { total_rsvp: list.length, total_guests: totalGuests, total_people: list.length + totalGuests } })
})

// DELETE /api/admin/rsvp/:id
router.delete('/rsvp/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM rsvp WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// --- Convites ---

// GET /api/admin/invites
router.get('/invites', requireAdmin, (_req, res) => {
  const list = db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all()
  const confirmed = list.filter(i => i.status === 'confirmed')
  const totalConfirmed = confirmed.reduce((s, i) => s + (i.confirmed_guests || 0), 0)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const withLinks = list.map(i => ({ ...i, link: `${frontendUrl}/confirmar/${i.id}` }))
  res.json({
    list: withLinks,
    summary: {
      total_invites: list.length,
      confirmed: confirmed.length,
      declined: list.filter(i => i.status === 'declined').length,
      pending: list.filter(i => i.status === 'pending').length,
      total_confirmed_guests: totalConfirmed,
    },
  })
})

// POST /api/admin/invites
router.post('/invites', requireAdmin, (req, res) => {
  const { name, max_guests } = req.body ?? {}
  if (!name?.trim()) return res.status(400).json({ error: 'name e obrigatorio.' })
  const count = Number(max_guests)
  if (!Number.isInteger(count) || count < 1) return res.status(400).json({ error: 'max_guests deve ser inteiro maior que 0.' })

  const id = randomUUID()
  db.prepare('INSERT INTO invites (id, name, max_guests) VALUES (?, ?, ?)').run(id, name.trim(), count)

  const invite = db.prepare('SELECT * FROM invites WHERE id = ?').get(id)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  res.status(201).json({ ...invite, link: `${frontendUrl}/confirmar/${id}` })
})

// PUT /api/admin/invites/:id
router.put('/invites/:id', requireAdmin, (req, res) => {
  const invite = db.prepare('SELECT id FROM invites WHERE id = ?').get(req.params.id)
  if (!invite) return res.status(404).json({ error: 'Convite nao encontrado.' })

  const { name, max_guests } = req.body ?? {}
  const fields = []
  const values = []

  if (name != null) { fields.push('name = ?'); values.push(name.trim()) }
  if (max_guests != null) {
    const count = Number(max_guests)
    if (!Number.isInteger(count) || count < 1) return res.status(400).json({ error: 'max_guests deve ser inteiro maior que 0.' })
    fields.push('max_guests = ?'); values.push(count)
  }

  if (!fields.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' })

  values.push(req.params.id)
  db.prepare(`UPDATE invites SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const updated = db.prepare('SELECT * FROM invites WHERE id = ?').get(req.params.id)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  res.json({ ...updated, link: `${frontendUrl}/confirmar/${req.params.id}` })
})

// DELETE /api/admin/invites/:id
router.delete('/invites/:id', requireAdmin, (req, res) => {
  const invite = db.prepare('SELECT id FROM invites WHERE id = ?').get(req.params.id)
  if (!invite) return res.status(404).json({ error: 'Convite nao encontrado.' })
  db.prepare('DELETE FROM invites WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// GET /api/admin/messages
router.get('/messages', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all())
})

// DELETE /api/admin/messages/:id
router.delete('/messages/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// GET /api/admin/payments
router.get('/payments', requireAdmin, (_req, res) => {
  const payments = db.prepare(`
    SELECT p.*, g.name AS gift_name
    FROM payments p
    LEFT JOIN gifts g ON g.id = p.gift_id
    ORDER BY p.created_at DESC
  `).all()
  res.json(payments)
})

export default router
