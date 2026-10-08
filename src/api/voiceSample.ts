import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './client'

export type SampleStatus = 'idle' | 'loading' | 'playing' | 'error'

type Listener = () => void

/** One sample plays at a time across the whole admin: starting a new one stops the previous. */
let current: { stop: () => void } | null = null

/**
 * Plays a short spoken sample of an agent voice
 * (GET /api/admin/config/voices/{voice}/sample, admin only). One request per press; the server
 * picks one of three fixed sentences.
 */
export function useVoiceSample() {
  const [status, setStatus] = useState<SampleStatus>('idle')
  const [voice, setVoice] = useState<string | null>(null)
  const mine = useRef<{ stop: () => void } | null>(null)

  const stop = useCallback(() => {
    mine.current?.stop()
  }, [])

  const play = useCallback((v: string) => {
    current?.stop()
    const abort = new AbortController()
    let audio: HTMLAudioElement | null = null
    let url: string | null = null
    let done = false
    const cleanup: Listener = () => {
      if (audio) {
        audio.onplaying = null
        audio.onended = null
        audio.onpause = null
        audio.onerror = null
        audio.pause()
        audio.removeAttribute('src')
      }
      if (url) URL.revokeObjectURL(url)
      audio = null
      url = null
    }
    const handle = {
      stop: () => {
        if (done) return
        done = true
        abort.abort()
        cleanup()
        if (current === handle) current = null
        if (mine.current === handle) mine.current = null
        setStatus('idle')
      },
    }
    const fail = () => {
      if (done) return
      done = true
      cleanup()
      if (current === handle) current = null
      if (mine.current === handle) mine.current = null
      setStatus('error')
    }
    current = handle
    mine.current = handle
    setVoice(v)
    setStatus('loading')
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/admin/config/voices/{voice}/sample', {
          params: { path: { voice: v } },
          parseAs: 'blob',
          signal: abort.signal,
        })
        if (done) return
        if (!response.ok || !(data instanceof Blob)) return fail()
        url = URL.createObjectURL(data)
        audio = new Audio(url)
        audio.onplaying = () => {
          if (!done) setStatus('playing')
        }
        audio.onended = () => handle.stop()
        audio.onerror = fail
        await audio.play()
      } catch {
        if (!done) fail()
      }
    })()
  }, [])

  useEffect(() => () => mine.current?.stop(), [])

  return { status, voice, play, stop }
}
