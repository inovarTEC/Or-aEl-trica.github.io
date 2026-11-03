import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

const titulo = 'OrçaElétrica — Orçamento de Instalação Elétrica';
const descricao = 'Monte o orçamento completo da sua instalação elétrica residencial de forma simples e rápida.';

export const metadata = {
  metadataBase: new URL(process.env.URL ?? 'http://localhost:3000'),
  title: titulo,
  description: descricao,
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  openGraph: { title: titulo, description: descricao, images: ['/og-image.png'] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
