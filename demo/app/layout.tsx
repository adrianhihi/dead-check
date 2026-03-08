import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'dead-check demo',
  description: 'A minimal dead man\'s switch — interactive demo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0a] text-gray-100 antialiased">
        {children}
      </body>
    </html>
  )
}
