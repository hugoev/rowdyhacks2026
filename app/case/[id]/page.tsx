import type { Metadata } from 'next';
import { CaseFileView } from '@/components/case-file';
export const metadata: Metadata = { title: 'Case file · Tripwire' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseFileView id={id}/>;
}
