# How to Sell TeleVault Pro (Manual Process)

Since payment gateway integration is not yet live, here's the full process for selling manually.
This requires no code changes — just a terminal and an email client.

---

## Step 1: Accept payment

Use any of these methods to collect payment:

| Method | Notes |
|--------|-------|
| **UPI** | Share your UPI ID (Google Pay, PhonePe, Paytm) |
| **Bank transfer** | Share account details directly |
| **Razorpay Payment Link** | Create a one-time link at [razorpay.com](https://razorpay.com) — no code needed |
| **Instamojo** | Create a product listing and share the link |

**Suggested pricing:**
- Pro Monthly — ₹299/month
- Pro Annual — ₹999/year
- Pro Lifetime — ₹2499 one-time

*(Adjust as you see fit. There's no system enforcing these prices — it's a manual process.)*

---

## Step 2: Generate the license key

Once payment is confirmed, SSH into your server and run:

```bash
cd /path/to/televault/server

# For annual license (expires 1 year from today)
ts-node scripts/generate-license.ts \
  --tier pro \
  --email customer@example.com \
  --expires 2027-06-11

# For lifetime license
ts-node scripts/generate-license.ts \
  --tier pro \
  --email customer@example.com \
  --lifetime

# For team license (10 seats, annual)
ts-node scripts/generate-license.ts \
  --tier team \
  --email team@company.com \
  --seats 10 \
  --expires 2027-06-11 \
  --notes "Acme Corp — 10-seat team deal"
```

The output will look like:

```
╔════════════════════════════════════════════╗
║         TeleVault License Created          ║
╠════════════════════════════════════════════╣
║  Key    : TV-AB12-CD34-EF56-GH78          ║
║  Tier   : Pro                              ║
║  Email  : customer@example.com             ║
║  Seats  : 3                                ║
║  Expires: 2027-06-11                       ║
╚════════════════════════════════════════════╝

✅ Send this key to the customer.
✅ They enter it in TeleVault → Settings → License → Activate.
```

Copy the key (format: `TV-XXXX-XXXX-XXXX-XXXX`).

---

## Step 3: Send the key to the customer

**Email template:**

---

**Subject:** Your TeleVault Pro License Key

Hi [Name],

Thank you for purchasing TeleVault Pro! Here's your license key:

```
TV-XXXX-XXXX-XXXX-XXXX
```

**To activate:**
1. Open TeleVault
2. Go to **Settings → License**
3. Paste your key and click **"Activate"**

Your license supports up to **3 devices**. If you need to move to a new computer:
- Go to Settings → License → Deactivate Machine (on the old computer), OR
- Email me and I'll free up a seat manually.

Questions? Reply to this email.

— TeleVault Team

---

## Step 4: Track your licenses

Check all active licenses at any time:

```bash
cd server
ts-node scripts/list-licenses.ts
ts-node scripts/list-licenses.ts --active-only
ts-node scripts/list-licenses.ts --tier pro
```

Or via the admin API (requires `X-Admin-Secret` header):

```bash
curl http://localhost:3001/api/admin/licenses \
  -H "X-Admin-Secret: your-admin-secret"
```

---

## Handling refunds / deactivations

To deactivate a license (e.g. refund):

```bash
# Via admin API
curl -X DELETE http://localhost:3001/api/admin/licenses/TV-XXXX-XXXX-XXXX-XXXX \
  -H "X-Admin-Secret: your-admin-secret"
```

The customer's app will show "License inactive" on the next validation check (within 24 hours).

---

## When the payment gateway is ready

All of the above becomes automated. See `docs/PAYMENT_GATEWAY.md` for the integration plan.
The license creation and validation logic is already built — payment webhooks just call `createLicense()`.

// TODO: Add payment gateway — see PAYMENT_GATEWAY.md
