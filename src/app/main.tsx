import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { WorkoutLibrary } from '@/workouts/WorkoutLibrary'
import './styles.css'

const root = document.getElementById('root')
const STRENGTH_LIBRARY_HASH = '#/strength-library'

const Root = () => {
  const [showWorkoutLibrary, setShowWorkoutLibrary] = useState(
    () => window.location.hash === STRENGTH_LIBRARY_HASH
  )

  useEffect(() => {
    const syncViewFromHash = () => setShowWorkoutLibrary(window.location.hash === STRENGTH_LIBRARY_HASH)
    window.addEventListener('hashchange', syncViewFromHash)
    return () => window.removeEventListener('hashchange', syncViewFromHash)
  }, [])

  const openWorkoutLibrary = () => {
    window.location.hash = STRENGTH_LIBRARY_HASH
    setShowWorkoutLibrary(true)
  }

  const closeWorkoutLibrary = () => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    setShowWorkoutLibrary(false)
  }

  return showWorkoutLibrary
    ? <WorkoutLibrary onClose={closeWorkoutLibrary} />
    : <App onOpenWorkoutLibrary={openWorkoutLibrary} />
}

if (root) {
  createRoot(root).render(<Root />)
}
