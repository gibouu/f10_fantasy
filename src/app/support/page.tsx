export const metadata = {
  title: 'Support – FX Racing',
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-2">FX Racing Support</h1>
      <p className="text-sm text-muted-foreground mb-10">We're here to help.</p>

      <section className="space-y-8 text-sm leading-relaxed">
        <div>
          <h2 className="font-semibold text-base mb-2">Contact Us</h2>
          <p className="text-muted-foreground mb-4">
            For any questions or issues, reach out by email:
          </p>
          <a
            href="mailto:support@fxracing.ca"
            className="inline-block font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors"
          >
            support@fxracing.ca
          </a>
          <p className="text-muted-foreground mt-3">
            We typically respond within 24 hours.
          </p>
        </div>
      </section>
    </main>
  )
}
