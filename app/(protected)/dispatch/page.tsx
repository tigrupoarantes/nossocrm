'use client'

import dynamic from 'next/dynamic'
import { PageLoader } from '@/components/PageLoader'

const MassDispatchPage = dynamic(
  () => import('@/features/dispatch/MassDispatchPage').then((m) => ({ default: m.MassDispatchPage })),
  { loading: () => <PageLoader />, ssr: false }
)

export default function Page() {
  return <MassDispatchPage />
}
