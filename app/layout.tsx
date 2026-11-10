import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KubeLab: Interactive Kubernetes Simulator',
  description: 'Learn namespaces, labels, ConfigMaps and Secrets by operating a simulated cluster with live kubectl commands.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
