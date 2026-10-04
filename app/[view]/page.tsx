import { notFound } from 'next/navigation';
import Tripwire, { type View } from '@/components/tripwire';
const views = ['guardian', 'protected', 'student', 'relative', 'inspector', 'cases', 'settings', 'drill', 'weather'];
export function generateStaticParams() { return views.map(view => ({ view })); }
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!views.includes(view)) notFound();
  return <Tripwire view={view as View} />;
}
