import type { Metadata, Viewport } from "next";
import "./globals.css";

// Flip to `false` if mobile pinch-zoom should be enabled again.
const DISABLE_MOBILE_ZOOM = true;

export const metadata: Metadata = {
  title: "Production Workflow System",
  description: "Production workflow dashboard",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/pwa/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/pwa/icon-maskable.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/pwa/icon.svg", type: "image/svg+xml", sizes: "any" }],
  },
  appleWebApp: {
    title: "Production Workflow System",
    statusBarStyle: "black-translucent",
    capable: true,
  },
};

const appViewport: Viewport = DISABLE_MOBILE_ZOOM
  ? {
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      viewportFit: "cover",
      themeColor: "#0b0f14",
    }
  : {
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
      themeColor: "#0b0f14",
    };

export const viewport: Viewport = appViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lv" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
