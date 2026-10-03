import type { CaseEducation, CaseFile, Payment } from './types';

export function explainCase(file: CaseFile, payment: Payment): CaseEducation {
  const stories: Record<string, string> = {
    'The Grandson Job': 'This money request matched warning signs of a caller pretending to be a relative in trouble.',
    'The IRS Job': 'This money request matched warning signs of someone pretending to be a government official.',
    'The Safe Account Job': 'This request matched a common story about moving money to a so-called safe account.',
    'The Tech Support Job': 'This request matched warning signs of an unexpected caller asking for access to your device.',
    'The Romance Job': 'This request matched warning signs of an online relationship being used to ask for money.',
    'The Fake Check Job': 'This request matched warning signs of a check offer that asks you to send money back.',
  };
  const protections = ['Your guardian denied this demo payment. It was not sent.'];
  if (file.evidence?.held) protections.unshift('Tripwire paused the payment for a family check.');
  if (file.evidence?.safeWordFailed) protections.push('The caller did not give the correct family safe word.');
  if (file.evidence?.callbackDenied) protections.push('Your relative replied that they were not the person calling.');
  return {
    whatHappened: stories[file.title] || `Your guardian stopped a ${payment.rail.replace('-', ' ')} payment for a family check. A denied payment does not prove there was a scam.`,
    clues: [...new Set(file.tells)].slice(0, 3), protections,
    nextStep: file.title === 'The IRS Job' ? 'Contact the agency using a number from its official website.' : file.title === 'The Safe Account Job' || file.title === 'The Fake Check Job' ? 'Call your bank using the number on your bank card.' : 'Call the person who asked for money using a number you already have saved.',
    source: 'rules',
  };
}
