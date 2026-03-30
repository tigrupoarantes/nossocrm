'use client'

import dynamic from 'next/dynamic'
import { PageLoader } from '@/components/PageLoader'

// Dynamic import with loading state — inclui abas: Vendas, Análise IA, Automações, Prospecção
const DashboardTabsWrapper = dynamic(
    () => import('@/features/dashboard/DashboardTabsWrapper').then((m) => ({ default: m.DashboardTabsWrapper })),
    {
        loading: () => <PageLoader />,
        ssr: false
    }
)

/**
 * Componente React `Dashboard`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function Dashboard() {
    return <DashboardTabsWrapper />
}
