"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

interface TabBarLinkProps {
  href: string
  label: string
  icon: ReactNode
}

export function TabBarLink({ href, label, icon }: TabBarLinkProps) {
  const pathname = usePathname()

  // Use startsWith for all routes — no root-exact-match edge case needed
  // since both tabs live under /picks and /leaderboard.
  const isActive =
    pathname === href ||
    (href !== "/" && pathname.startsWith(href)) ||
    (href === "/races" && pathname.startsWith("/picks"))

  return (
    <Link
      href={href}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2
                  text-xs font-medium transition-colors
                  ${isActive ? "text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className={`transition-transform ${isActive ? "scale-110" : "scale-100"}`}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  )
}
