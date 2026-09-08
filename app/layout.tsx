import type { Metadata } from 'next';
import { Geist, Lora } from 'next/font/google';
import './globals.css';
const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const lora = Lora({ variable: '--font-story', subsets: ['latin'] });
export const metadata: Metadata = {
  title: 'Lantern Table · Your adventure, at your pace',
  description:
    'An open-source tabletop adventure for friends. Human and AI dungeon masters, persistent campaigns, and asynchronous play.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${lora.variable}`}>{children}</body>
    </html>
  );
}
