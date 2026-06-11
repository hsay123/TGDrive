export function isTelevaultAvailable(): boolean {
  return typeof window !== 'undefined' && window.televault != null
}
