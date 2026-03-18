'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/PageLoader';
import { use } from 'react';

const LandingPageBuilder = dynamic(
  () => import('@/features/landing-pages/components/LandingPageBuilder').then(m => ({ default: m.LandingPageBuilder })),
  { loading: () => <PageLoader />, ssr: false }
);

export default function EditLandingPagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <LandingPageBuilder landingPageId={id} />;
}
