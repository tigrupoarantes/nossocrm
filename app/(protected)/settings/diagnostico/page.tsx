'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/PageLoader';

const DiagnosticoPage = dynamic(
  () => import('@/features/settings/DiagnosticoPage').then((m) => ({ default: m.DiagnosticoPage })),
  { loading: () => <PageLoader />, ssr: false },
);

export default function Diagnostico() {
  return <DiagnosticoPage />;
}
