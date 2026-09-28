import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import '@livekit/components-styles';
import { CallNotificationCenter } from '@/components/call-notification-center';
import { CurrencyPreferenceBar, CurrencyPreferenceProvider } from '@/components/currency-preference';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
  title: 'Homes Worldwide | Global Real Estate Marketplace',
  description: 'Find homes, rentals, land, and commercial property in cities around the world.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <CurrencyPreferenceProvider>
          <CurrencyPreferenceBar />
          {children}
          <CallNotificationCenter />
        </CurrencyPreferenceProvider>
      </body>
    </html>
  );
}
