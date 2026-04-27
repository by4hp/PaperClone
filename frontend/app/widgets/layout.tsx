// Layout for embeddable widgets — keep root <html><body> from the
// app's RootLayout but render bare children with no header/sidebar.
// Iframe parents control sizing; we set transparent bg so widgets blend
// into the host page's background.
export default function WidgetsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-transparent">{children}</main>
  );
}
