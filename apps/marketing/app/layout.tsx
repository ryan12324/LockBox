import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-authwell",
  subsets: ["latin"],
  display: "swap",
});

const title = "Authwell | Your passwords. Your infrastructure. Your control.";
const description =
  "An end-to-end encrypted password manager with a hosted vault, browser autofill, Android support, CLI access, and first-class self-hosting.";

export const metadata: Metadata = {
  metadataBase: new URL("https://authwell.app"),
  title,
  description,
  applicationName: "Authwell",
  alternates: { canonical: "/" },
  icons: {
    icon: "/brand/authwell-app-icon.png?v=authwell-2",
    apple: "/brand/authwell-app-icon.png?v=authwell-2",
  },
  openGraph: {
    type: "website",
    title,
    description:
      "A private vault for every device, with a hosted option when you want it and self-hosting when you do not.",
    siteName: "Authwell",
    url: "/",
    images: [{ url: "/og.png?v=authwell-2", width: 1732, height: 906, alt: "Authwell. Your passwords. Your infrastructure. Your control." }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "A private vault for every device, with a hosted option when you want it and self-hosting when you do not.",
    images: ["/og.png?v=authwell-2"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#10162f",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
