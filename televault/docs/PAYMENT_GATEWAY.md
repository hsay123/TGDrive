# Payment Gateway Integration (Future Phase)

Payment gateway integration is **not yet implemented**.
This document describes the plan for when it is.

> [!NOTE]
> The license creation and validation system is fully built.
> Adding payments only requires wiring a webhook → `createLicense()`.
> No other changes are needed.

---

## Why not yet

- **Razorpay** requires Indian businesses to complete KYC (GST, PAN, bank details). This verification takes 3–7 business days.
- **Stripe** has limited availability in India (invite-only for Indian businesses as of 2026).
- **Manual process is sufficient** for early access — see `docs/HOW_TO_SELL.md`.

---

## Planned approach: Razorpay

Once the Razorpay account is verified:

### 1. Create products in Razorpay Dashboard

Go to [dashboard.razorpay.com](https://dashboard.razorpay.com) and create:

| Product | Price | Type |
|---------|-------|------|
| TeleVault Pro Monthly | ₹299/month | Subscription |
| TeleVault Pro Annual | ₹999/year | Subscription |
| TeleVault Pro Lifetime | ₹2499 | One-time |

### 2. Add credentials to server `.env`

```env
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
```

### 3. Create webhook handler

Add `server/routes/razorpay-webhook.ts`:

```typescript
import { Router } from 'express'
import crypto from 'crypto'
import { createLicense } from '../db/licenses'
import { sendLicenseEmail } from '../email/sender'  // implement separately

const router = Router()

router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  // Verify webhook signature
  const signature = req.headers['x-razorpay-signature']
  const body = req.body.toString()
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex')

  if (signature !== expected) {
    return res.status(400).json({ error: 'Invalid signature' })
  }

  const event = JSON.parse(body)

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity
    const email = payment.email
    const notes = payment.notes  // { tier, seats }

    // TODO: Add payment gateway — this is the integration point
    const license = createLicense({
      tier: notes.tier || 'pro',
      email,
      seats: notes.seats ? parseInt(notes.seats) : undefined,
      expiresAt: notes.annual ? Date.now() + 365 * 24 * 60 * 60 * 1000 : null,
      notes: `Razorpay payment: ${payment.id}`,
    })

    // Send license key to customer via email
    sendLicenseEmail(email, license.key, license.tier)
  }

  if (event.event === 'subscription.cancelled') {
    // TODO: deactivate license tied to this subscription
  }

  return res.json({ ok: true })
})

export default router
```

### 4. Register the webhook route

In `server/index.ts`, add after the existing routes:

```typescript
// TODO: Add payment gateway webhook handler here
import razorpayWebhook from './routes/razorpay-webhook'
app.use('/api/webhooks/razorpay', razorpayWebhook)
```

### 5. Add checkout to the desktop app

In `src/pages/Upgrade.tsx`, replace the waitlist form with the Razorpay checkout widget:

```typescript
// TODO: Replace waitlist form with Razorpay checkout
declare const Razorpay: any

function openCheckout(plan: 'monthly' | 'annual' | 'lifetime') {
  const rzp = new Razorpay({
    key: import.meta.env.VITE_RAZORPAY_KEY_ID,
    amount: plan === 'monthly' ? 29900 : plan === 'annual' ? 99900 : 249900,
    currency: 'INR',
    name: 'TeleVault',
    description: `TeleVault Pro — ${plan}`,
    prefill: { email: userEmail },
    notes: { tier: 'pro', annual: plan === 'annual' ? '1' : '0' },
    handler: (response: any) => {
      // Payment captured — license key will arrive via email (webhook sends it)
      showSuccessMessage()
    },
  })
  rzp.open()
}
```

---

## Files to modify (full list)

| File | Change |
|------|--------|
| `server/index.ts` | Add `app.use('/api/webhooks/razorpay', razorpayWebhook)` |
| `server/routes/razorpay-webhook.ts` | Create — handles `payment.captured` → `createLicense()` |
| `server/.env.example` | Uncomment Razorpay vars |
| `src/pages/Upgrade.tsx` | Replace waitlist with Razorpay checkout widget |
| `src/pages/Upgrade.tsx` | Load Razorpay script via `<script>` tag |
| `electron-builder.yml` | No changes needed |
| `server/db/licenses.ts` | No changes needed |

Everything else stays the same. The license creation and validation logic is already complete.

---

## Alternative: Stripe (when available in India)

If Stripe becomes available, the approach is nearly identical:
- Use `stripe.webhooks.constructEvent()` instead of HMAC check
- Event: `checkout.session.completed` → `createLicense()`
- Event: `customer.subscription.deleted` → `deactivateLicense()`
