import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { getDb } from './db/db'
import licenseRoutes from './routes/license'
import adminRoutes from './routes/admin'

dotenv.config()

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(express.json())
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://televault.app']
    : ['http://localhost:5173', 'http://localhost:3000'],
}))

// Health check
app.get('/health', (_, res) => {
  res.json({ ok: true, version: '0.1.0', ts: Date.now() })
})

// Routes
app.use('/api/license', licenseRoutes)
app.use('/api/admin', adminRoutes)

// 404 handler
app.use((_, res) => res.status(404).json({ error: 'Not found' }))

// Initialize DB
getDb()
console.log('[db] License database initialized')

app.listen(PORT, () => {
  console.log(`TeleVault license server running on http://localhost:${PORT}`)
  console.log(`Admin API: POST /api/admin/licenses (requires X-Admin-Secret header)`)
  // TODO: Add payment gateway webhook handler here in a future phase
})

export default app
