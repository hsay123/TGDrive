import { Router, Request, Response, NextFunction } from 'express'
import {
  getAllLicenses,
  createLicense,
  deactivateLicense,
  getActivations,
  getLicenseByKey,
} from '../db/licenses'

const router = Router()

// Middleware: require X-Admin-Secret header
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers['x-admin-secret']
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

router.use(requireAdmin)

// GET /api/admin/licenses — list all licenses
router.get('/licenses', (_req: Request, res: Response) => {
  const licenses = getAllLicenses()
  return res.json({ licenses, total: licenses.length })
})

// POST /api/admin/licenses — create a new license manually
// Body: { tier, email, seats?, expiresAt?, notes? }
router.post('/licenses', (req: Request, res: Response) => {
  const { tier, email, seats, expiresAt, notes } = req.body
  if (!tier || !email) return res.status(400).json({ error: 'tier and email required' })
  if (!['pro', 'team'].includes(tier)) return res.status(400).json({ error: 'tier must be pro or team' })

  try {
    const license = createLicense({ tier, email, seats, expiresAt, notes })
    return res.status(201).json({ license })
  } catch (err) {
    console.error('[admin/licenses] create error:', err)
    return res.status(500).json({ error: 'Failed to create license' })
  }
})

// GET /api/admin/licenses/:key — get license details + activations
router.get('/licenses/:key', (req: Request, res: Response) => {
  const license = getLicenseByKey(req.params.key)
  if (!license) return res.status(404).json({ error: 'License not found' })
  const activations = getActivations(req.params.key)
  return res.json({ license, activations })
})

// DELETE /api/admin/licenses/:key — deactivate a license
router.delete('/licenses/:key', (req: Request, res: Response) => {
  deactivateLicense(req.params.key)
  return res.json({ success: true })
})

export default router
