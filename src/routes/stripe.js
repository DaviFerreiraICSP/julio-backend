import { Router } from 'express'
import Stripe from 'stripe'
import { randomUUID } from 'crypto'
import db from '../db.js'

const router = Router()

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-05-28.basil' })
}

// POST /api/payments/stripe/create-intent
router.post('/create-intent', async (req, res) => {
  const { gift_id, payer_name, payer_email } = req.body ?? {}
  if (!gift_id || !payer_name || !payer_email) {
    return res.status(400).json({ error: 'gift_id, payer_name e payer_email sao obrigatorios.' })
  }

  const gift = db.prepare('SELECT * FROM gifts WHERE id = ? AND active = 1').get(gift_id)
  if (!gift) return res.status(404).json({ error: 'Presente nao encontrado.' })
  if (gift.gifted) return res.status(409).json({ error: 'Este presente ja foi presenteado.' })

  try {
    const stripe = getStripe()
    const amountCents = Math.round(gift.price * 100)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'brl',
      description: `Presente: ${gift.name} - Casamento Thaise & Julio`,
      metadata: { gift_id, payer_name, payer_email },
      receipt_email: payer_email,
    })

    const paymentId = randomUUID()
    db.prepare(`
      INSERT INTO payments (id, gift_id, stripe_payment_intent_id, amount, status, payer_name, payer_email, payment_method)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, 'card')
    `).run(paymentId, gift_id, paymentIntent.id, gift.price, payer_name.trim(), payer_email.trim())

    res.json({ client_secret: paymentIntent.client_secret, payment_id: paymentId })
  } catch (err) {
    console.error('[Stripe] Erro ao criar intent:', err.message)
    res.status(502).json({ error: 'Erro ao iniciar pagamento. Tente novamente.' })
  }
})

// POST /api/payments/stripe/webhook — recebe eventos do Stripe
// Obs: o corpo raw e configurado em app.js antes do express.json()
router.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (err) {
    console.error('[Stripe Webhook] Assinatura invalida:', err.message)
    return res.status(400).json({ error: 'Webhook invalido.' })
  }

  res.sendStatus(200)

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object
    const giftId = pi.metadata?.gift_id
    const payerName = pi.metadata?.payer_name || 'Convidado'

    try {
      db.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE stripe_payment_intent_id = ?')
        .run('approved', Date.now(), pi.id)
      db.prepare('UPDATE gifts SET gifted = 1, gifted_by = ?, gifted_at = ? WHERE id = ?')
        .run(payerName, Date.now(), giftId)
      console.log(`[Stripe Webhook] Presente ${giftId} confirmado por ${payerName}`)
    } catch (err) {
      console.error('[Stripe Webhook] Erro ao processar:', err)
    }
  }
})

export default router
