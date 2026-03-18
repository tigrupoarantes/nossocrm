'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/PageLoader';

const LandingPageBuilder = dynamic(
  () => import('@/features/landing-pages/components/LandingPageBuilder').then(m => ({ default: m.LandingPageBuilder })),
  { loading: () => <PageLoader />, ssr: false }
);

export default function NewLandingPagePage() {
  return <LandingPageBuilder />;
}
