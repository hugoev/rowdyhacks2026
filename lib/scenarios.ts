import type { Language } from './types';

export type Scenario = { title: string; description: string; kind: 'scam' | 'benign'; type: string; language: Language; lines: string[] };

/** Typed caller lines for the operator fallback and the red-team harness. Synthetic only. */
export const scenarios = {
  grandson: { title: 'The Grandson Job', description: 'A familiar voice. An unfamiliar request.', kind: 'scam', type: 'grandchild in jail', language: 'en', lines: [
    'Grandma, it’s me. I got arrested. I need $2,500 for bail right now.',
    'Please, don’t tell Mom. She can’t find out about this.',
    'Grandma, there’s no time for that! Please, I’m scared.',
    'Just send it from your bank app, as gift cards. Hurry.',
  ] },
  irs: { title: 'The IRS Job', description: 'Authority. Fear. A gift-card demand.', kind: 'scam', type: 'IRS', language: 'en', lines: [
    'This is Officer Daniels from the IRS. I am calling about your unpaid taxes.',
    'There is a warrant for your arrest. You need to act right now.',
    'Do not call your bank or tell anyone. Buy $2,500 in Apple gift cards and read me the card codes.',
  ] },
  safeAccount: { title: 'The Safe Account Job', description: 'A fake fraud team. A real transfer.', kind: 'scam', type: 'bank safe account', language: 'en', lines: [
    'Hello, this is the Frost Bank fraud department. Your account has been compromised.',
    'You need to move your savings to a safe account immediately, within the next ten minutes.',
    'Don’t tell the branch staff, they may be involved. Wire the money to the account I give you.',
  ] },
  nieto: { title: 'El nieto en la cárcel', description: 'La misma estafa, en español.', kind: 'scam', type: 'grandchild in jail', language: 'es', lines: [
    'Abuela, soy yo. Me arrestaron y estoy en la cárcel.',
    'Necesito dinero para la fianza ahora mismo. Por favor no le digas a mi mamá.',
    'No hay tiempo, abuela. Compra tarjetas de regalo y mándame los códigos.',
  ] },
  normal: { title: 'An ordinary call', description: 'A dinner plan. No money pressure.', kind: 'benign', type: 'none', language: 'en', lines: [
    'Hi Grandma, it’s Diego. Are we still on for dinner Sunday?',
    'I’ll bring the salad. See you at six. Love you!',
  ] },
} satisfies Record<string, Scenario>;
