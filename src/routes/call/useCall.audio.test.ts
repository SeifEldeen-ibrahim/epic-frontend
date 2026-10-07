import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCall } from './useCall'

vi.mock('../../api/calls', () => ({
  answerSession: vi.fn(),
  createCall: vi.fn(),
  endCall: vi.fn(),
  getCall: vi.fn(),
  endCallOnUnload: vi.fn(),
  reconnectCall: vi.fn(),
}))
vi.mock('../../api/callEvents', () => ({ streamCallEvents: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('call microphone', () => {
  it('asks for echo cancellation, noise suppression and auto gain, so noise and echo do not cut the agent off', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    vi.stubGlobal('RTCPeerConnection', class {})
    vi.stubGlobal('isSecureContext', true)

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, null, children)
    const { result } = renderHook(() => useCall(), { wrapper })
    await act(async () => {
      await result.current.start()
    })

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  })
})
