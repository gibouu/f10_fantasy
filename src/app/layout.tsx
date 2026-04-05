import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Providers } from "@/components/Providers"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  // Expose as a CSS variable so Tailwind's `font-sans` utility picks it up.
  variable: "--font-inter",
  display: "swap",
})

export const metadata: Metadata = {
  title: "F10 Racing",
  description: "The F1 prediction game where 10th place matters most",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // dark class activates Tailwind dark-mode utilities globally.
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-background`}>
        {/*
         * Phone-sized container: max 430px, centered on wider viewports.
         * min-h-screen ensures the background color fills the full viewport.
         */}
        <div className="max-w-[430px] mx-auto min-h-screen bg-background">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}
