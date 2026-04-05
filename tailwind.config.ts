import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    extend: {
      colors: {
        // Design system — backed by CSS variables so they can be read at
        // runtime (e.g. for chart colors) and overridden per-theme.
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        border: "var(--border)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",

        // shadcn-compatible aliases so existing ui/ components still compile.
        foreground: "var(--text-primary)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--surface-elevated)",
          foreground: "var(--text-primary)",
        },
        muted: {
          DEFAULT: "var(--surface)",
          foreground: "var(--text-secondary)",
        },
        card: {
          DEFAULT: "var(--surface)",
          foreground: "var(--text-primary)",
        },
        popover: {
          DEFAULT: "var(--surface-elevated)",
          foreground: "var(--text-primary)",
        },
        destructive: {
          DEFAULT: "#ff453a",
          foreground: "#ffffff",
        },
        input: "var(--surface-elevated)",
        ring: "var(--accent)",
      },

      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },

      borderRadius: {
        // Tiered scale derived from the 16px base token (--radius: 1rem)
        "4xl": "calc(var(--radius) + 8px)",  // 24px
        "3xl": "calc(var(--radius) + 4px)",  // 20px
        "2xl": "calc(var(--radius))",         // 16px — default card radius
        xl:    "calc(var(--radius) - 2px)",  // 14px
        lg:    "calc(var(--radius) - 4px)",  // 12px
        md:    "calc(var(--radius) - 6px)",  // 10px
        sm:    "calc(var(--radius) - 8px)",  // 8px
      },

      keyframes: {
        // Kept for shadcn accordion compatibility
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Design-system entry animations
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
