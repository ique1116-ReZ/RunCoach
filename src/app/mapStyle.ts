const maptilerKey = import.meta.env.VITE_MAPTILER_KEY
const mapId = 'streets-v2'

export const mapStyleUrl = `https://api.maptiler.com/maps/${mapId}/style.json?key=${maptilerKey ?? ''}`
