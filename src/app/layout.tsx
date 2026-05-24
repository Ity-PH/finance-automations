import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Two Serendra — Disconnection Notice Automations",
  description:
    "Internal tool for bulk-generating PDF disconnection notices from Excel data and Word templates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-white text-black antialiased">{children}</body>
    </html>
  );
}
