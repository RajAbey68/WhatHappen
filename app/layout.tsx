import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PasswordProtection } from './components/PasswordProtection'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'WhatsApp Chat Analyzer',
  description: 'Analyze your WhatsApp conversations with AI-powered insights',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PasswordProtection>
          {children}
        </PasswordProtection>
      </body>
    </html>
  )
} 