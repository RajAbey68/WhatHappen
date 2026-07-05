import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth-provider'
import { LoginGate } from '@/components/login-gate'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'WhatsApp Analyzer',
  description: 'Analyze your WhatsApp chat exports with AI-powered insights',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <LoginGate>
            <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
              {children}
            </main>
          </LoginGate>
        </AuthProvider>
      </body>
    </html>
  )
} 