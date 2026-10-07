import { useEffect, useSyncExternalStore } from 'react'

// How many mounted editors hold unsaved edits right now. The shared changes bar reads it so
// "Make changes live" never puts something live other than what was saved.
let dirtyEditors = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True while any editor on the page has unsaved edits. */
export function useHasUnsavedEdits(): boolean {
  return useSyncExternalStore(subscribe, () => dirtyEditors > 0)
}

/** Warns before the tab is closed or reloaded while an editor has unsaved changes, and tells the
 * changes bar. In-app navigation is guarded by the editors themselves (their Back/Cancel actions
 * confirm). */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    dirtyEditors += 1
    emit()
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      dirtyEditors -= 1
      emit()
    }
  }, [dirty])
}

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave without saving?'
