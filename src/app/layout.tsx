import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MyBooks', template: '%s · MyBooks' },
  description: 'Private multi-company bookkeeping',
  applicationName: 'MyBooks',
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'MyBooks', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#1f8a4c' }, { media: '(prefers-color-scheme: dark)', color: '#0f1512' }],
};

// Sets the theme before first paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('mb-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
