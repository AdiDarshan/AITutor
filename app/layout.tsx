import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Course Tutor",
  description: "A guided, step-by-step AI tutor that teaches one small piece at a time.",
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
