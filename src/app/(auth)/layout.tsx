import { Providers } from "@/components/Providers"

export default function RetiredAuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <Providers>{children}</Providers>
}
