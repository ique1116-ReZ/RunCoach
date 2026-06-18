import { ZoneConfig } from './types'

export const defaultZones: ZoneConfig = {
  base: 'LTHR',
  zones: [
    { id: 'z1', min: 50, max: 60, label: 'Z1 恢复', color: '#3b82f6' },
    { id: 'z2', min: 60, max: 70, label: 'Z2 有氧', color: '#22c55e' },
    { id: 'z3', min: 70, max: 80, label: 'Z3 过渡', color: '#eab308' },
    { id: 'z4', min: 80, max: 90, label: 'Z4 阈值', color: '#f97316' },
    { id: 'z5', min: 90, max: 100, label: 'Z5 无氧', color: '#ef4444' }
  ]
}

export const zoneForHr = (hr: number | undefined, baseValue: number, zones = defaultZones.zones) => {
  if (!hr || !baseValue) return null
  const percent = (hr / baseValue) * 100
  return zones.find(zone => percent >= zone.min && percent < zone.max) ?? zones[zones.length - 1]
}
