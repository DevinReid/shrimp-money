import { Providers } from '@/components/Providers';
import BackgroundEmojis from '@/components/BackgroundEmojis';
import MusicPlayer from '@/components/MusicPlayer';
import CursorSpinner from '@/components/CursorSpinner';
import './globals.css';

export const metadata = {
  title: '🦐 Shrimp Money 💜',
  description: 'Connect your bank account to view balances and transactions ✨',
};

// Mobile foundation: ensure phones render at device width (not zoomed-out desktop)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body>
        <BackgroundEmojis />
        <MusicPlayer />
        <Providers>
          <CursorSpinner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
