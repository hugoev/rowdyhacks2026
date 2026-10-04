export const scenarios = {
  irs: { title: 'The IRS Job', description: 'Authority. Fear. A gift-card demand.', lines: [
    'This is Officer Daniels with the IRS. I am calling about your unpaid taxes.',
    'There is a warrant for your arrest. You need to act right now.',
    'Buy $2,500 in Apple gift cards immediately and read me the card codes.',
  ] },
  grandson: { title: 'The Grandson Job', description: 'A familiar voice. An unfamiliar request.', lines: [
    'Grandma, it is me. I am in jail and I need your help.',
    'Please hurry. I need you to send money for bail right now.',
    'Please don’t tell Mom. Keep this secret. Buy gift cards and send me the codes.',
  ] },
  fakeJob: { title: 'The Fake Job Check', description: 'A fake paycheck. A request to send the difference back.', lines: [
    'Congratulations on the remote job. We are sending you a check to buy your equipment.',
    'Deposit it today. You can keep five hundred dollars for your time.',
    'Please wire the rest to our equipment vendor right now. The check already cleared, so there is no risk.',
  ] },
  normal: { title: 'An ordinary call', description: 'A dinner plan. No money pressure.', lines: [
    'Hi Rosa, are we still meeting for dinner on Sunday?',
    'I will bring the salad. See you at six. Have a lovely afternoon!',
  ] },
} as const;
export const scanSamples = [
  { title: 'Delivery text', text: 'USPS: Your package is held. Act now. Verify your login and password at https://usps-redelivery.example/pay to release it.', risky: true },
  { title: 'Romance · plane ticket', text: 'My love, even though we have never met, I love you. Please send me money for a plane ticket immediately. Don’t tell anyone.', risky: true },
  { title: 'Romance · medical bills', text: 'I am overseas on an oil rig. My love, I need you to wire money for medical bills right now. Keep this secret.', risky: true },
  { title: 'Government impostor', text: 'This is the IRS. There is a warrant for your arrest. Pay with gift cards immediately.', risky: true },
  { title: 'Fake job offer', text: 'Welcome to your remote job. Deposit this check for equipment and send the difference back by wire immediately.', risky: true },
  { title: 'Safe account', text: 'Your savings are at risk. Move your money to a safe account immediately. Do not tell anyone.', risky: true },
  { title: 'Tech support', text: 'Microsoft support detected a computer virus. Install AnyDesk for remote access and buy gift cards to pay.', risky: true },
  { title: 'Family emergency', text: 'Grandma I am in jail. Hurry, send money for bail. Don’t tell Mom.', risky: true },
  { title: 'Library reminder', text: 'Your library book is due on Tuesday. Renew it in person or through your usual library account.', risky: false },
  { title: 'Dinner plans', text: 'Hi Rosa! Dinner at our place Sunday at six. I will bring the salad. See you there.', risky: false },
];
