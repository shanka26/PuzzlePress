import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PuzzlePress — Books made thoughtfully",
  description: "Create print-ready large-print word search books for Amazon KDP.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
