import type { CaseEducation as Education } from '@/lib/types';

export function CaseEducation({ education }: { education: Education }) {
  return <div className="case-education">
    <h3>What happened</h3><p>{education.whatHappened}</p>
    <h3>What gave us pause</h3><ul>{education.clues.map(clue => <li key={clue}>{clue}</li>)}</ul>
    <h3>How your family helped</h3><ul>{education.protections.map(protection => <li key={protection}>{protection}</li>)}</ul>
    <h3>Your next step</h3><p>{education.nextStep}</p>
    <p>You did nothing wrong. These callers are skilled at creating urgency.</p>
    <p className="small-note">{education.source === 'gemini' ? 'Gemini helped explain the warning signs.' : 'Written from the recorded warning signs.'} Payments in this app are simulated.</p>
  </div>;
}
