import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata = {
  title: 'Bank Account Manager',
  description: 'Connect your bank account to view balances and transactions',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

