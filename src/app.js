import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import adminRoutes from './routes/admin.js'
import giftsRoutes from './routes/gifts.js'
import rsvpRoutes from './routes/rsvp.js'
import invitesRoutes from './routes/invites.js'
import messagesRoutes from './routes/messages.js'
import paymentsRoutes from './routes/payments.js'
import stripeRoutes from './routes/stripe.js'
import pixRoutes from './routes/pix.js'
import settingsRoutes from './routes/settings.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

// Webhooks precisam do corpo raw antes do express.json()
app.use('/api/payments/webhook', express.raw({ type: '*/*' }))
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }))
app.use(express.json())

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..')
app.use('/uploads', express.static(join(DATA_DIR, 'uploads'), { maxAge: '7d' }))
app.use('/api/admin', adminRoutes)
app.use('/api/gifts', giftsRoutes)
app.use('/api/rsvp', rsvpRoutes)
app.use('/api/invites', invitesRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/payments/stripe', stripeRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/pix', pixRoutes)
app.use('/api/settings', settingsRoutes)

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Erro interno do servidor.' })
})

export default app
