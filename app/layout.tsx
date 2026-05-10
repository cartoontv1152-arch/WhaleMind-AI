import React from "react"
import type { Metadata } from 'next'
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const instrumentSans = Instrument_Sans({ 
  subsets: ["latin"],
  variable: '--font-instrument'
});

const instrumentSerif = Instrument_Serif({ 
  subsets: ["latin"],
  weight: "400",
  variable: '--font-instrument-serif'
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: '--font-jetbrains'
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
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
      <body className={`${instrumentSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
