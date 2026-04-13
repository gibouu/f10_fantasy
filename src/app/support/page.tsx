export const metadata = {
  title: 'Support – FX Racing',
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-2">Support</h1>
      <p className="text-sm text-muted-foreground mb-10">FX Racing</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <p className="text-muted-foreground">
          For support, bug reports, or legal inquiries, contact:
        </p>
        <a
          href="mailto:support@fxracing.ca"
          className="inline-block font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors"
        >
          support@fxracing.ca
        </a>
        <p className="text-muted-foreground">We are here to help.</p>
      </section>
    </main>
  )
}
