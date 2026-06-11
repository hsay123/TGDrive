import { useState, useEffect } from 'react'

type Feature = 'encryption' | 'sync' | 'versioning' | 'sharing' | 'team'

export function useLicense() {
  const [tier, setTier] = useState<'free' | 'pro' | 'team'>('free')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    window.televault?.license.getTier().then((result) => {
      if (result.success && result.data) {
        setTier(result.data)
      }
      setIsLoading(false)
    })
  }, [])

  const isPro = tier === 'pro' || tier === 'team'
  const isTeam = tier === 'team'

  function isFeatureEnabled(feature: Feature): boolean {
    const proFeatures: Feature[] = ['encryption', 'sync', 'versioning', 'sharing']
    const teamFeatures: Feature[] = ['team']
    if (teamFeatures.includes(feature)) return isTeam
    if (proFeatures.includes(feature)) return isPro
    return true
  }

  return { tier, isPro, isTeam, isLoading, setTier, isFeatureEnabled }
}
