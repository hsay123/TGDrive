import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { validateLicense, logValidation, deactivateMachine } from '../db/licenses'

const router = Router()

// Rate limit: 20 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests' },
})

// POST /api/activate
// Body: { token: string, machineId: string }
// Response: { valid: boolean, reason?: string }
router.post('/activate', limiter, (req: Request, res: Response) => {
  const { token, machineId } = req.body

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ valid: false, reason: 'missing_token' })
  }
  if (!machineId || typeof machineId !== 'string') {
    return res.status(400).json({ valid: false, reason: 'missing_machine_id' })
  }

  try {
    // Reuse existing license validation — token IS the license key
    const result = validateLicense(token.trim().toUpperCase(), machineId)
    const ip = req.ip || 'unknown'
    logValidation(token, machineId, result.valid ? 'success' : result.reason || 'invalid', ip)
    return res.json({ valid: result.valid, reason: result.reason })
  } catch (err) {
    console.error('[license/activate] error:', err)
    return res.status(500).json({ valid: false, reason: 'server_error' })
  }
})

// POST /api/license/validate (legacy — kept for backward compat)
// Body: { key: string, machineId: string }
router.post('/validate', limiter, (req: Request, res: Response) => {
  const { key, machineId } = req.body

  if (!key || typeof key !== 'string' || !key.startsWith('TV-')) {
    return res.status(400).json({ valid: false, reason: 'invalid_key_format' })
  }
  if (!machineId || typeof machineId !== 'string') {
    return res.status(400).json({ valid: false, reason: 'missing_machine_id' })
  }

  try {
    const result = validateLicense(key.trim().toUpperCase(), machineId)
    const ip = req.ip || 'unknown'
    logValidation(key, machineId, result.valid ? 'success' : result.reason || 'invalid', ip)
    return res.json(result)
  } catch (err) {
    console.error('[license/validate] error:', err)
    return res.status(500).json({ valid: false, reason: 'server_error' })
  }
})

// POST /api/license/deactivate-machine
router.post('/deactivate-machine', limiter, (req: Request, res: Response) => {
  const { key, machineId } = req.body
  if (!key || !machineId) return res.status(400).json({ error: 'Missing key or machineId' })

  try {
    const removed = deactivateMachine(key, machineId)
    return res.json({ success: removed })
  } catch (err) {
    console.error('[license/deactivate-machine] error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
})

export default router
