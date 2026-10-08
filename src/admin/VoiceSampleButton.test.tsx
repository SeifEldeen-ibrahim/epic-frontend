import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { api } from '../api/client'
import { createQueryClient } from '../api/queryClient'
import { useVoiceSample } from '../api/voiceSample'
import { AdminRoutes } from './AdminRoutes'
import { fxAdmin, fxAgentDesk, fxAgents, fxCatalog, fxConfigReviewer, fxConfigState, fxForms, fxReviewer, fxRouting } from './fixtures/data'
import { VoiceSampleButton } from './VoiceSampleButton'

vi.mock('../api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }))
const GET = vi.mocked(api.GET) as unknown as Mock

class FakeAudio {
  static all: FakeAudio[] = []
  src: string
  paused = true
  onplaying: (() => void) | null = null
  onended: (() => void) | null = null
  onpause: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(src: string) {
    this.src = src
    FakeAudio.all.push(this)
  }
  play() {
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
  removeAttribute() {
    this.src = ''
  }
}

function ok() {
  return Promise.resolve({ data: new Blob(['mp3'], { type: 'audio/mpeg' }), response: new Response(null, { status: 200 }) })
}

function Harness({ initial = 'marin', id = 'a' }: { initial?: string; id?: string }) {
  const [voice, setVoice] = useState(initial)
  const s = useVoiceSample()
  return (
    <div data-testid={`h-${id}`}>
      <button
        type="button"
        data-testid={`change-${id}`}
        onClick={() => {
          s.stop()
          setVoice('cedar')
        }}
      >
        change
      </button>
      <VoiceSampleButton voice={voice} status={s.status} onPlay={() => s.play(voice)} onStop={s.stop} />
    </div>
  )
}

const btn = () => screen.getByTestId('agent-voice-sample')
const last = () => FakeAudio.all[FakeAudio.all.length - 1]

beforeEach(() => {
  FakeAudio.all = []
  vi.stubGlobal('Audio', FakeAudio)
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  GET.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('T-FE-SAMPLE: voice sample button', () => {
  it('loads, plays, then stops on Stop', async () => {
    let resolve: (v: unknown) => void = () => {}
    GET.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<Harness />)
    expect(btn()).toHaveAccessibleName('Play a sample of the marin voice')
    await userEvent.click(btn())
    expect(btn()).toBeDisabled()
    expect(btn()).toHaveTextContent('Loading…')
    expect(GET).toHaveBeenCalledWith('/api/admin/config/voices/{voice}/sample', expect.objectContaining({ params: { path: { voice: 'marin' } }, parseAs: 'blob' }))
    await act(async () => resolve(await ok()))
    expect(last().paused).toBe(false)
    act(() => last().onplaying?.())
    expect(btn()).toHaveTextContent('■ Stop')
    expect(screen.getByTestId('agent-voice-sample-status')).toHaveTextContent('Playing a sample of marin.')
    await userEvent.click(btn())
    expect(last().paused).toBe(true)
    expect(btn()).toHaveTextContent('▶ Play sample')
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('returns to idle when the sample ends', async () => {
    GET.mockImplementation(ok)
    render(<Harness />)
    await userEvent.click(btn())
    act(() => last().onplaying?.())
    act(() => last().onended?.())
    expect(btn()).toHaveTextContent('▶ Play sample')
  })

  it('shows a plain error on a refused request (e.g. 429)', async () => {
    GET.mockResolvedValue({ data: undefined, error: { detail: 'too_many_samples' }, response: new Response(null, { status: 429 }) })
    render(<Harness />)
    await userEvent.click(btn())
    expect(screen.getByTestId('agent-voice-sample-status')).toHaveTextContent('Could not play the sample. Try again.')
    expect(btn()).toHaveAttribute('data-status', 'error')
    expect(btn()).toBeEnabled()
  })

  it('shows a plain error when the audio cannot play', async () => {
    GET.mockImplementation(ok)
    render(<Harness />)
    await userEvent.click(btn())
    act(() => last().onerror?.())
    expect(screen.getByTestId('agent-voice-sample-status')).toHaveTextContent('Could not play the sample. Try again.')
  })

  it('starting a second sample stops the first', async () => {
    GET.mockImplementation(ok)
    render(
      <>
        <Harness id="a" />
        <Harness id="b" initial="ash" />
      </>,
    )
    const [a, b] = screen.getAllByTestId('agent-voice-sample')
    await userEvent.click(a)
    act(() => FakeAudio.all[0].onplaying?.())
    expect(a).toHaveTextContent('■ Stop')
    await userEvent.click(b)
    expect(FakeAudio.all[0].paused).toBe(true)
    expect(a).toHaveTextContent('▶ Play sample')
  })

  it('changing the voice stops the sample', async () => {
    GET.mockImplementation(ok)
    render(<Harness />)
    await userEvent.click(btn())
    act(() => last().onplaying?.())
    await userEvent.click(screen.getByTestId('change-a'))
    expect(last().paused).toBe(true)
    expect(btn()).toHaveAccessibleName('Play a sample of the cedar voice')
  })

  it('stops when the page unmounts', async () => {
    GET.mockImplementation(ok)
    const view = render(<Harness />)
    await userEvent.click(btn())
    act(() => last().onplaying?.())
    view.unmount()
    expect(last().paused).toBe(true)
  })

  it('works from the keyboard', async () => {
    GET.mockImplementation(ok)
    render(<Harness />)
    btn().focus()
    await userEvent.keyboard('{Enter}')
    expect(GET).toHaveBeenCalledTimes(1)
    act(() => last().onplaying?.())
    await userEvent.keyboard(' ')
    expect(btn()).toHaveTextContent('▶ Play sample')
  })
})

describe('T-FE-SAMPLE: in the agent editor', () => {
  function serve(me: object, config: object) {
    const replies: Record<string, unknown> = {
      '/api/admin/auth/me': me,
      '/api/admin/config': config,
      '/api/admin/config/catalog': fxCatalog,
      '/api/admin/config/draft/knowledge/{section}': fxRouting,
      '/api/admin/config/draft/agents': fxAgents,
      '/api/admin/config/draft/forms': fxForms,
      '/api/admin/config/draft/agents/{name}': fxAgentDesk,
    }
    GET.mockImplementation(async (path: string) =>
      path in replies ? { data: replies[path], response: { status: 200, ok: true } } : new Promise(() => {}),
    )
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/admin/agents/fixture_desk']}>
          <Routes>
            <Route path="/admin/*" element={<AdminRoutes />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('shows Play sample next to the voice for an admin', async () => {
    serve(fxAdmin, fxConfigState)
    const select = await screen.findByTestId('agent-voice')
    const button = await screen.findByTestId('agent-voice-sample')
    expect(button).toHaveAccessibleName(`Play a sample of the ${(select as HTMLSelectElement).value} voice`)
  })

  it('hides it when the page is read-only', async () => {
    serve(fxReviewer, fxConfigReviewer)
    await screen.findByTestId('agent-voice')
    expect(screen.queryByTestId('agent-voice-sample')).toBeNull()
  })
})
