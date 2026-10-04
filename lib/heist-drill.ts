export type DrillScenarioId = 'government' | 'family' | 'tech-support' | 'romance' | 'safe-account' | 'fake-job';
export type DrillAction = 'pause' | 'independent-check' | 'tell-trusted-person' | 'share-info' | 'send-money' | 'keep-secret';
export type DrillChoice = { id: DrillAction; label: string; safe: boolean };
export type DrillRound = { caller: string; tell: string; choices: DrillChoice[] };
export type DrillScenario = { id: DrillScenarioId; title: string; description: string; rounds: DrillRound[] };
export type DrillResult = { score: number; correct: number; total: number; missed: string[]; feedback: string; nextTime: string; source: 'rules' | 'gemini' };

const safeChoices: DrillChoice[] = [
  { id: 'independent-check', label: 'End the conversation and verify using a number I already trust.', safe: true },
  { id: 'tell-trusted-person', label: 'Pause and bring in someone I trust before acting.', safe: true },
  { id: 'pause', label: 'Stop. I will not send money or share details while pressured.', safe: true },
];
const unsafeChoices: DrillChoice[] = [
  { id: 'send-money', label: 'Do what they asked so the problem goes away.', safe: false },
  { id: 'share-info', label: 'Give them the information they need to help me.', safe: false },
  { id: 'keep-secret', label: 'Keep it private and handle it by myself.', safe: false },
];
const round = (caller: string, tell: string, distractor: DrillChoice) => ({ caller, tell, choices: [...safeChoices, distractor].sort((a, b) => a.id.localeCompare(b.id)) });

export const drillScenarios: DrillScenario[] = [
  { id: 'government', title: 'The Government Impostor', description: 'A caller claims authority and threatens arrest.', rounds: [
    round('This is a federal officer. There is a serious problem with your record.', 'Government impersonation', unsafeChoices[1]),
    round('You could be arrested today. You must act before we disconnect.', 'Threats and urgent pressure', unsafeChoices[0]),
    round('Stay on the line and buy gift cards to settle this quietly.', 'Gift cards and isolation', unsafeChoices[2]),
  ] },
  { id: 'family', title: 'The Family Emergency', description: 'A caller claims a loved one is in trouble and asks for secrecy.', rounds: [
    round('Grandma, it is me. I am in trouble and I need you right now.', 'Unverified family emergency', unsafeChoices[1]),
    round('Please do not call anyone else. There is no time.', 'Urgency and isolation', unsafeChoices[2]),
    round('Send money to this account and I will explain later.', 'Unverified payment request', unsafeChoices[0]),
  ] },
  { id: 'tech-support', title: 'The Tech Support Job', description: 'A caller invents a device emergency and asks for access.', rounds: [
    round('We found a dangerous problem on your computer. I can fix it now.', 'Unsolicited technical support', unsafeChoices[1]),
    round('Install this remote-access tool so I can take control.', 'Request for device access', unsafeChoices[1]),
    round('Buy a gift card for the repair. Do not contact the store.', 'Unusual payment and isolation', unsafeChoices[0]),
  ] },
  { id: 'romance', title: 'The Romance Request', description: 'An online connection turns affection into an urgent money request.', rounds: [
    round('You are the only person I can trust. I need your help.', 'Emotional pressure', unsafeChoices[2]),
    round('I cannot meet you yet, but I need a wire transfer for an emergency.', 'Unverified story and wire request', unsafeChoices[0]),
    round('Please keep this between us until I can pay you back.', 'Secrecy and repayment promise', unsafeChoices[2]),
  ] },
  { id: 'safe-account', title: 'The Safe Account', description: 'A caller says your money is in danger and must be moved.', rounds: [
    round('Your savings are at risk. I am calling from your bank’s security team.', 'Unverified bank identity', unsafeChoices[1]),
    round('Move your money now to this safe account to protect it.', 'Transfer to a caller-provided account', unsafeChoices[0]),
    round('Do not hang up or tell your family; they could delay the rescue.', 'Urgency and isolation', unsafeChoices[2]),
  ] },
  { id: 'fake-job', title: 'The Fake Job', description: 'A recruiter offers quick pay but asks you to move money first.', rounds: [
    round('You got the remote job. We will send a check for your equipment.', 'Unexpected check and job offer', unsafeChoices[1]),
    round('Deposit it today, buy equipment from our vendor, and send back the extra.', 'Overpayment and money-forwarding request', unsafeChoices[0]),
    round('We need your bank login to set up direct deposit.', 'Request for account credentials', unsafeChoices[1]),
  ] },
];

export function findDrillScenario(id: string) { return drillScenarios.find(scenario => scenario.id === id); }
export function scoreDrill(scenario: DrillScenario, actions: DrillAction[]): DrillResult {
  const total = scenario.rounds.length;
  const correct = actions.slice(0, total).reduce((count, action, index) => count + Number(scenario.rounds[index]?.choices.find(choice => choice.id === action)?.safe === true), 0);
  const missed = scenario.rounds.filter((_, index) => !scenario.rounds[index].choices.find(choice => choice.id === actions[index])?.safe).map(item => item.tell);
  const score = Math.round((correct / total) * 100);
  return { score, correct, total, missed, feedback: score === 100 ? 'You slowed the caller down and chose independent verification. Keep using a number you already trust.' : score >= 67 ? 'You caught important warning signs. One pressured moment still needs a pause and an independent check.' : 'A convincing story can create pressure. End the conversation, do not send money or share details, and check with someone you trust.', nextTime: 'Pause, end contact, and verify using a number you already trust.', source: 'rules' };
}
