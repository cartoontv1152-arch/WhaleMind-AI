import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

function getAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const vercelUrl = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)?.trim();
  return vercelUrl ? `https://${vercelUrl}` : undefined;
}

const appUrl = getAppUrl();

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: 'WhaleMind AI - On-chain Trading Intelligence',
  description: 'AI-powered SoSoValue research, whale signals, and SoDEX order-intent execution on ValueChain.',
  generator: 'WhaleMind AI',
  icons: {
    icon: [
      {
        url: '/images/whale.png',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/images/whale.png',
        type: 'image/png',
      },
    ],
  },
  openGraph: {
    title: 'WhaleMind AI',
    description: 'AI-powered SoSoValue research, whale signals, and SoDEX order-intent execution on ValueChain.',
    images: ['/images/whale.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  )
}
