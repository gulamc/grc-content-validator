import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GCI Content Validator',
  description: 'Content Validator - Global Content & Intelligence',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}