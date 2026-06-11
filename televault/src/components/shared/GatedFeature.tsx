import { useNavigate } from 'react-router-dom'
import { Lock, Zap } from 'lucide-react'
import { useLicense } from '../../hooks/useLicense'
import { Button } from './Button'
import type { ReactNode } from 'react'

type Feature = 'encryption' | 'sync' | 'versioning' | 'sharing' | 'team'

interface GatedFeatureProps {
  feature: Feature
  children: ReactNode
  inline?: boolean
}

const featureNames: Record<Feature, string> = {
  encryption: 'AES-256 Encryption',
  sync: 'Cross-Device Sync',
  versioning: 'File Version History',
  sharing: 'File Sharing',
  team: 'Team Workspaces',
}

const featureTiers: Record<Feature, 'pro' | 'team'> = {
  encryption: 'pro',
  sync: 'pro',
  versioning: 'pro',
  sharing: 'pro',
  team: 'team',
}

export function GatedFeature({ feature, children, inline = false }: GatedFeatureProps) {
  const { isFeatureEnabled } = useLicense()
  const navigate = useNavigate()

  if (isFeatureEnabled(feature)) {
    return <>{children}</>
  }

  const requiredTier = featureTiers[feature]
  const featureName = featureNames[feature]

  if (inline) {
    return (
      <div className="relative inline-flex items-center gap-1">
        <div className="pointer-events-none select-none opacity-40">{children}</div>
        <span title="Upgrade to Pro" className="text-gray-500 cursor-not-allowed">
          <Lock className="h-3.5 w-3.5" />
        </span>
      </div>
    )
  }

  return (
    <div className="relative rounded-xl border border-gray-700 bg-gray-800/50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20">
        <Lock className="h-6 w-6 text-violet-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-100">Pro Feature</h3>
      <p className="mt-1 text-sm text-gray-400">
        <span className="text-gray-200">{featureName}</span> is available on the{' '}
        <span className="capitalize text-violet-400">{requiredTier}</span> plan.
      </p>
      <Button
        variant="primary"
        size="sm"
        icon={<Zap className="h-3.5 w-3.5" />}
        className="mt-4"
        onClick={() => navigate('/upgrade')}
      >
        View Pro Features
      </Button>
    </div>
  )
}
