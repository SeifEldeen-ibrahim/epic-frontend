import { Link, useParams, useSearchParams } from 'react-router'
import type { ScreenText } from '../../api/calls'
import { PageLayout } from '../../ui'
import { CALL_STATES, isCallStateKey, type CallState } from './callMachine'
import { CallView } from './CallView'
import { COPY, SHIPPED_SCREEN_TEXT } from './copy'

const FIXTURE_STATES: Record<string, CallState> = {
  idle: { key: 'idle' },
  requesting_mic: { key: 'requesting_mic' },
  mic_denied: { key: 'mic_denied' },
  unsupported: { key: 'unsupported', unsupportedReason: 'no_webrtc' },
  connecting: { key: 'connecting' },
  on_call: { key: 'on_call', startedAt: 0 },
  reconnecting: { key: 'reconnecting', startedAt: 0 },
  ended: { key: 'ended' },
  unavailable: { key: 'unavailable' },
  crisis: { key: 'crisis' },
  handoff: { key: 'handoff', handoffTitle: 'Residential & Day Programs' },
  human_needed: { key: 'human_needed' },
}

/** Dev-only fixture text for Arabic (right to left), as an admin would fill it in. Not shipped:
 * the real page only shows the languages `GET /api/screen-text` returns. */
const ARABIC_FIXTURE: ScreenText['languages'][number] = {
  code: 'ar',
  name: 'العربية',
  dir: 'rtl',
  lines: {
    reconnecting: 'جارٍ إعادة الاتصال…',
    ended: 'انتهت المكالمة.',
    mic_denied: 'الميكروفون محظور. اسمح بالميكروفون لهذا الموقع في إعدادات المتصفح، ثم أعد تحميل هذه الصفحة.',
    unsupported: 'لا يمكن لهذا المتصفح إجراء المكالمة. يُرجى استخدام إصدار حديث من Chrome أو Edge أو Firefox أو Safari.',
    insecure: 'لا يمكن لهذه الصفحة استخدام الميكروفون لأنها لم تُفتح عبر اتصال آمن (https).',
    unavailable: 'لا يمكننا استقبال المكالمات الآن.',
    crisis: 'تم إيقاف هذه المكالمة. يُرجى طلب المساعدة الآن.',
    crisis_help:
      'إذا كنت في أزمة: اتصل بالرقم 911، أو توجّه إلى أقرب غرفة طوارئ، أو اتصل بفريق الأزمات المتنقل في مقاطعة ناسو على الرقم 516-227-8255.',
    handoff_title: 'طلبك موجّه إلى {title}.',
    handoff_recorded: 'تم تسجيل طلبك لموظفي العيادة. انتهت المكالمة.',
    human_needed_screen: 'يحتاج أحد موظفي العيادة إلى مساعدتك في هذا الأمر.',
    main_line_label: 'الخط الرئيسي للعيادة — الرقم قيد التأكيد',
  },
}

const WITH_ARABIC: ScreenText = {
  ...SHIPPED_SCREEN_TEXT,
  languages: [...SHIPPED_SCREEN_TEXT.languages, ARABIC_FIXTURE],
}

const FIXTURE_LANGUAGES = ['en', 'es', 'ar']

/** Call-language variants: `<state>-es|en|ar` (or any state with `?lang=es|en|ar`). `ar` also turns
 * Arabic on, so `crisis?lang=ar` is the crisis screen with Arabic enabled. */
const LANGUAGE_VARIANTS = [
  'reconnecting-es',
  'ended-es',
  'handoff-es',
  'human_needed-es',
  'ended-en',
  'handoff-en',
  'human_needed-en',
  'crisis-en',
  'crisis-es',
  'ended-ar',
  'handoff-ar',
  'human_needed-ar',
  'crisis-ar',
]

function fixtureFor(param: string | undefined, langParam: string | null): CallState | null {
  const [base, suffix, extra] = (param ?? '').split('-')
  if (!isCallStateKey(base) || extra !== undefined) return null
  if (suffix !== undefined && !FIXTURE_LANGUAGES.includes(suffix)) return null
  const language = suffix ?? (langParam && FIXTURE_LANGUAGES.includes(langParam) ? langParam : null)
  return language ? { ...FIXTURE_STATES[base], language } : FIXTURE_STATES[base]
}

const noop = () => undefined

/** Dev-only (loaded only when import.meta.env.DEV): every caller state, no mic, for screenshots. */
export function CallFixtures() {
  const { state } = useParams()
  const [searchParams] = useSearchParams()
  const fixture = fixtureFor(state, searchParams.get('lang'))
  const screenText = fixture?.language === 'ar' ? WITH_ARABIC : SHIPPED_SCREEN_TEXT
  return (
    <PageLayout title="Call" data-testid="call-fixtures-root">
      <h1>{COPY.heading}</h1>
      {fixture ? (
        <CallView
          state={fixture}
          elapsedSeconds={83}
          onCall={noop}
          onEnd={noop}
          onReset={noop}
          onUnlockAudio={noop}
          screenText={screenText}
        />
      ) : (
        <ul>
          {[...CALL_STATES, ...LANGUAGE_VARIANTS].map((key) => (
            <li key={key}>
              <Link className="ui-link" to={`/call/fixtures/${key}`}>
                {key}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  )
}
