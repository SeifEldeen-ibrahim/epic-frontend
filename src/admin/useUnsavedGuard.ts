import { useEffect } from 'react'

/** Warns before the tab is closed or reloaded while an editor has unsaved changes. In-app
 * navigation is guarded by the editors themselves (their Back/Cancel actions confirm). */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave without saving?'
