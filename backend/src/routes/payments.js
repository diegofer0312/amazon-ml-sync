const express = require('express');
const { run, get } = require('../database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_...')) return null;
  return require('stripe')(key);
}

// POST /api/payments/create-checkout
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe no configurado. Agrega STRIPE_SECRET_KEY al .env' });
    }

    const user = req.user;
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { user_id: String(user.id) },
      });
      customerId = customer.id;
      await run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing?cancelled=true`,
      metadata: { user_id: String(user.id) },
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    logger.error('Error creando checkout Stripe:', err.message);
    res.status(500).json({ error: 'Error al crear sesión de pago' });
  }
});

// POST /api/payments/webhook — recibe eventos de Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(200).json({ received: true });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Webhook Stripe inválido:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const now = new Date().toISOString();
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

          await run('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?',
            ['pro', periodEnd, userId]);

          await run(`INSERT OR REPLACE INTO subscriptions
            (user_id, stripe_subscription_id, status, amount_usd, current_period_start, current_period_end, created_at)
            VALUES (?, ?, ?, 100, ?, ?, ?)`,
            [userId, sub.id, sub.status,
              new Date(sub.current_period_start * 1000).toISOString(), periodEnd, now]);

          logger.info(`Suscripción activada para usuario ${userId}`);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const userId = customer.metadata?.user_id;
        if (userId) {
          const isActive = ['active', 'trialing'].includes(sub.status);
          const plan = isActive ? 'pro' : 'trial';
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

          await run('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?',
            [plan, periodEnd, userId]);
          await run('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?',
            [sub.status, periodEnd, sub.id]);

          logger.info(`Suscripción ${sub.status} para usuario ${userId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        logger.warn(`Pago fallido para customer: ${invoice.customer}`);
        break;
      }
    }
  } catch (err) {
    logger.error('Error procesando webhook:', err.message);
  }

  res.json({ received: true });
});

// GET /api/payments/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const sub = await get(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );

    const isActive = user.plan === 'pro' &&
      user.plan_expires_at &&
      new Date(user.plan_expires_at) > new Date();

    res.json({
      plan: user.plan,
      is_active: isActive,
      expires_at: user.plan_expires_at,
      subscription: sub || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estado de suscripción' });
  }
});

// POST /api/payments/portal — portal de Stripe para gestionar suscripción
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe no configurado' });

    const user = req.user;
    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No tienes una suscripción activa' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error('Error creando portal Stripe:', err.message);
    res.status(500).json({ error: 'Error al abrir portal de facturación' });
  }
});

module.exports = router;
