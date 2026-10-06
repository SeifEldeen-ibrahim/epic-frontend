/**
 * Caller-page copy. Spanish lines and EPIC's main number are UNAPPROVED placeholders until EPIC
 * approves the wording and the owner supplies the number (see the talking-demo plan).
 */

export const EPIC_MAIN_NUMBER = {
  /** UNAPPROVED: number not yet supplied. */
  label: "EPIC's main line — number to be confirmed",
  labelEs: 'Línea principal de EPIC — número por confirmar',
  tel: null as string | null,
}

export const CRISIS = {
  en: 'If you are in crisis: call 911, go to the nearest emergency room, or call the Nassau County Mobile Crisis Team.',
  /** UNAPPROVED translation. */
  es: 'Si está en crisis: llame al 911, vaya a la sala de emergencias más cercana o llame al Equipo Móvil de Crisis del Condado de Nassau.',
  numbers: [
    { label: '911', tel: '911' },
    { label: '516-227-8255', tel: '5162278255' },
  ],
}

export const COPY = {
  heading: 'Talk to the EPIC voice agent',
  recorded: 'Calls are recorded.',
  fictional: 'Use fictional details only — this is a test line.',
  call: 'Call',
  requestingMic: 'Allow the microphone to talk to EPIC.',
  connecting: 'Connecting…',
  onCall: 'On call',
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
}
