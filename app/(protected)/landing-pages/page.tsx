'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/PageLoader';

const LandingPagesList = dynamic(
  () => import('@/features/landing-pages/components/LandingPagesList').then(m => ({ default: m.LandingPagesList })),
  { loading: () => <PageLoader />, ssr: false }
);

export default function LandingPagesPage() {
  return <LandingPagesList />;
}
