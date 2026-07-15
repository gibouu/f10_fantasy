import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL("https://www.fxracing.ca"),
  title: { default: "FX Racing — P1. P10. DNF.", template: "%s — FX Racing" },
  description:
    "Pick the winner, the P10 finisher, and a non-finisher before qualifying, then climb the global rankings.",
  appleWebApp: { title: "FX Racing" },
  itunes: { appId: "6762099290" },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
