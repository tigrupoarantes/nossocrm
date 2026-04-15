'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/PageLoader';

const AutomationsPage = dynamic(
  () => import('@/features/automation/components/AutomationsPage').then(m => ({ default: m.AutomationsPage })),
  { loading: () => <PageLoader />, ssr: false }
);

export default function Automacoes() {
  return <AutomationsPage />;
}
