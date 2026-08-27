import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import ThemeProvider from '@/components/ThemeProvider'
import AccessLogTracker from '@/components/layout/AccessLogTracker'
import MenuLoader from '@/components/layout/MenuLoader'
import './globals.css'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
})

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
})

export const metadata: Metadata = {
    title: 'GTP',
    description: '기빵 프로젝트',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <ThemeProvider>
                    <AccessLogTracker />
                    <MenuLoader />
                    {children}
                </ThemeProvider>
            </body>
        </html>
    )
}

