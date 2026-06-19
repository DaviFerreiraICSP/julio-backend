import { Router } from 'express'
import { randomUUID } from 'crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import db from '../db.js'

const router = Router()

function getMPClient() {
  return new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
    options: { timeout: 10000 },
  })
}

// POST /api/payments/pix — cria pagamento Pix via Mercado Pago
router.post('/pix', async (req, res) => {
  const { gift_id, payer_name, payer_email } = req.body ?? {}
  if (!gift_id || !payer_name || !payer_email) {
    return res.status(400).json({ error: 'gift_id, payer_name e payer_email são obrigatórios.' })
  }

  const gift = db.prepare('SELECT * FROM gifts WHERE id = ? AND active = 1').get(gift_id)
  if (!gift) return res.status(404).json({ error: 'Presente não encontrado.' })
  if (gift.gifted) return res.status(409).json({ error: 'Este presente já foi presenteado.' })

  try {
    const client = getMPClient()
    const paymentAPI = new Payment(client)

    const result = await paymentAPI.create({
      body: {
        transaction_amount: gift.price,
        payment_method_id: 'pix',
        description: `Presente: ${gift.name} - Casamento Thaise & Julio`,
        payer: { email: payer_email },
        external_reference: gift_id,
        notification_url: `${process.env.BACKEND_URL || 'https://seu-dominio.com'}/api/payments/webhook`,
      },
    })

    const paymentId = randomUUID()
    const mpId = String(result.id)
    const qrCode = result.point_of_interaction?.transaction_data?.qr_code
    const copyPaste = result.point_of_interaction?.transaction_data?.qr_code_base64

    db.prepare(`
      INSERT INTO payments (id, gift_id, mp_payment_id, amount, status, payer_name, payer_email, pix_qr_code, pix_copy_paste)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, gift_id, mpId, gift.price, 'pending', payer_name.trim(), payer_email.trim(), qrCode, copyPaste)

    res.json({
      payment_id: paymentId,
      mp_payment_id: mpId,
      amount: gift.price,
      pix_copy_paste: qrCode,
      pix_qr_code_base64: copyPaste,
      status: 'pending',
    })
  } catch (err) {
    console.error('[Pagamento] Erro Mercado Pago:', err)
    res.status(502).json({ error: 'Erro ao criar pagamento. Tente novamente.' })
  }
})

// POST /api/payments/webhook — recebe notificações do Mercado Pago
router.post('/webhook', async (req, res) => {
  // Responde 200 imediatamente (boa prática com MP)
  res.sendStatus(200)

  const { type, data } = req.body ?? {}
  if (type !== 'payment' || !data?.id) return

  try {
    const client = getMPClient()
    const paymentAPI = new Payment(client)
    const mpPayment = await paymentAPI.get({ id: data.id })

    if (mpPayment.status !== 'approved') return

    const giftId = mpPayment.external_reference
    const mpId = String(mpPayment.id)

    const payment = db.prepare('SELECT * FROM payments WHERE mp_payment_id = ?').get(mpId)
    if (!payment) return

    // Atualiza pagamento como aprovado
    db.prepare(
      'UPDATE payments SET status = ?, updated_at = ? WHERE mp_payment_id = ?'
    ).run('approved', Date.now(), mpId)

    // Marca presente como presenteado
    const payerName = payment.payer_name || 'Convidado'
    db.prepare(
      'UPDATE gifts SET gifted = 1, gifted_by = ?, gifted_at = ? WHERE id = ?'
    ).run(payerName, Date.now(), giftId)

    console.log(`[Webhook] Presente ${giftId} confirmado por ${payerName}`)
  } catch (err) {
    console.error('[Webhook] Erro ao processar:', err)
  }
})

// GET /api/payments/:id/status — consulta status de um pagamento
router.get('/:id/status', (req, res) => {
  const payment = db.prepare('SELECT status, amount, payer_name FROM payments WHERE id = ?').get(req.params.id)
  if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado.' })
  res.json(payment)
})

export default router
