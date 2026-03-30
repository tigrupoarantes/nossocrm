'use client'

import dynamic from 'next/dynamic'
import React from 'react'
import { PageLoader } from '@/components/PageLoader'
import { AlertTriangle, RefreshCw } from 'lucide-react'

const InboxPage = dynamic(
    () => import('@/features/inbox/InboxPage').then(m => ({ default: m.InboxPage })),
    { loading: () => <PageLoader />, ssr: false }
)

// ---------------------------------------------------------------------------
// Error Boundary — catches client-side crashes inside InboxPage
// ---------------------------------------------------------------------------
interface State { error: Error | null }

class InboxErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    constructor(props: { children: React.ReactNode }) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[InboxPage crash]', error, info.componentStack)
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                        <AlertTriangle className="h-7 w-7 text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                            Erro ao carregar a Inbox
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                            Ocorreu um erro inesperado. Tente recarregar a página.
                        </p>
                        <p className="mt-2 text-xs text-red-400 font-mono">
                            {this.state.error.message}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => this.setState({ error: null })}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Tentar novamente
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

/**
 * Componente React `Inbox`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function Inbox() {
    return (
        <InboxErrorBoundary>
            <InboxPage />
        </InboxErrorBoundary>
    )
}
