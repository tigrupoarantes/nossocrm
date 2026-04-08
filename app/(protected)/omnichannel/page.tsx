'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/PageLoader';

const OmnichannelPage = dynamic(
  () => import('@/features/omnichannel/OmnichannelPage').then((m) => ({ default: m.OmnichannelPage })),
  { loading: () => <PageLoader />, ssr: false },
);

export default function Omnichannel() {
  return <OmnichannelPage />;
}
