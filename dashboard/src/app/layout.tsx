import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Celebrity Image Sourcing | GBot.EXE",
  description: "AI-powered celebrity image sourcing system powered by GBot.EXE",
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
