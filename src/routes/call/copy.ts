/**
 * Caller-page copy. Spanish lines and the clinic's main number are UNAPPROVED placeholders until the client
 * approves the wording and the owner supplies the number (see the talking-demo plan).
 */

import type { ScreenText } from '../../api/calls'

export const EPIC_MAIN_NUMBER = {
  /** UNAPPROVED: number not yet supplied. */
  label: "The clinic's main line — number to be confirmed",
  labelEs: 'Línea principal de la clínica — número por confirmar',
  tel: null as string | null,
}

export const CRISIS = {
  en: 'If you are in crisis: call 911, go to the nearest emergency room, or call the Nassau County Mobile Crisis Team at 516-227-8255.',
  /** UNAPPROVED translation. */
  es: 'Si está en crisis: llame al 911, vaya a la sala de emergencias más cercana o llame al Equipo Móvil de Crisis del Condado de Nassau al 516-227-8255.',
  numbers: [
    { label: '911', tel: '911' },
    { label: '516-227-8255', tel: '5162278255' },
  ],
}

export const COPY = {
  heading: 'Talk to the clinic voice agent',
  recorded: 'Calls are recorded.',
  fictional: 'Use fictional details only — this is a test line.',
  call: 'Call',
  requestingMic: 'Allow the microphone to talk to the clinic.',
  connecting: 'Connecting…',
  onCall: 'On call',
  /** Spanish UNAPPROVED. */
  reconnecting: { en: 'Reconnecting…', es: 'Reconectando…' },
  end: 'End call',
  audioBlocked: 'Tap to hear the agent',
  ended: { en: 'Call ended.', es: 'Llamada terminada.' },
  callAgain: 'Call again',
  micDenied: {
    en: 'The microphone is blocked. Allow the microphone for this site in your browser settings, then reload this page.',
    es: 'El micrófono está bloqueado. Permita el micrófono para este sitio en la configuración del navegador y vuelva a cargar esta página.',
  },
  unsupported: {
    en: "This browser can't place the call. Please use a recent Chrome, Edge, Firefox or Safari.",
    es: 'Este navegador no puede realizar la llamada. Use una versión reciente de Chrome, Edge, Firefox o Safari.',
  },
  insecure: {
    en: "This page can't use the microphone because it was not opened over a secure (https) connection.",
    es: 'Esta página no puede usar el micrófono porque no se abrió con una conexión segura (https).',
  },
  unavailable: {
    en: "We can't take calls right now.",
    es: 'No podemos atender llamadas en este momento.',
  },
  tryAgain: 'Try again',
  /** Crisis stop. Spanish UNAPPROVED. */
  crisis: {
    en: 'This call has been stopped. Please get help now.',
    es: 'Esta llamada se ha detenido. Busque ayuda ahora.',
  },
  /** Department / current-client handoff: title only, never a name or extension. Spanish
   * UNAPPROVED. Honest wording: this line cannot transfer calls (BR-22). */
  handoff: {
    en: (title: string) => `Your request is for ${title}.`,
    es: (title: string) => `Su solicitud es para ${title}.`,
    recordedEn: 'Your request has been recorded for the clinic staff. Call ended.',
    recordedEs: 'Su solicitud quedó registrada para el personal de la clínica. Llamada terminada.',
  },
  /** Human needed. Spanish UNAPPROVED. */
  humanNeeded: {
    en: 'A member of the clinic staff needs to help with this.',
    es: 'Un miembro del personal de la clínica necesita ayudarle con esto.',
  },
}

/** The shipped English and Spanish screen text, keyed like `GET /api/screen-text` lines. Used when
 * the fetch fails or is still loading, and for any en/es line the server leaves out. */
export const SHIPPED_SCREEN_TEXT: ScreenText = {
  languages: [
    {
      code: 'en',
      name: 'English',
      dir: 'ltr',
      lines: {
        reconnecting: COPY.reconnecting.en,
        ended: COPY.ended.en,
        mic_denied: COPY.micDenied.en,
        unsupported: COPY.unsupported.en,
        insecure: COPY.insecure.en,
        unavailable: COPY.unavailable.en,
        crisis: COPY.crisis.en,
        crisis_help: CRISIS.en,
        handoff_title: COPY.handoff.en('{title}'),
        handoff_recorded: COPY.handoff.recordedEn,
        human_needed_screen: COPY.humanNeeded.en,
        main_line_label: EPIC_MAIN_NUMBER.label,
      },
    },
    {
      code: 'es',
      name: 'Español',
      dir: 'ltr',
      lines: {
        reconnecting: COPY.reconnecting.es,
        ended: COPY.ended.es,
        mic_denied: COPY.micDenied.es,
        unsupported: COPY.unsupported.es,
        insecure: COPY.insecure.es,
        unavailable: COPY.unavailable.es,
        crisis: COPY.crisis.es,
        crisis_help: CRISIS.es,
        handoff_title: COPY.handoff.es('{title}'),
        handoff_recorded: COPY.handoff.recordedEs,
        human_needed_screen: COPY.humanNeeded.es,
        main_line_label: EPIC_MAIN_NUMBER.labelEs,
      },
    },
  ],
  crisis_numbers: CRISIS.numbers.map((n) => n.label),
}
