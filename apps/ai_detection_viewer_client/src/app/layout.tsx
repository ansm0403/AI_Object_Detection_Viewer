import './global.css';

export const metadata = {
  title: 'AI Detection Viewer',
  description: 'Portfolio project: 3D visualization and 2D/3D sync for AI object detection data.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
