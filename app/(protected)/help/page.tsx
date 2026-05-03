import { Suspense } from 'react'
import { HelpCenterPage } from '@/features/help/HelpCenterPage'

export const metadata = { title: 'Ajuda | NossoCRM' }

export default function Page() {
  // useSearchParams() na HelpCenterPage exige Suspense boundary pra prerender.
  return (
    <Suspense fallback={null}>
      <HelpCenterPage />
    </Suspense>
  )
}
