import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pantry | Restaurant operations",
  description: "A calmer way to manage restaurant receiving, invoices and inventory. Interactive frontend demo.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
