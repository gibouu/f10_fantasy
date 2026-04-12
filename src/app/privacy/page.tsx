export const metadata = {
  title: 'Privacy Policy – FX Racing',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">FX Racing</p>

      <section className="space-y-8 text-sm leading-relaxed">
        <div>
          <p>FX Racing respects your privacy.</p>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-2">What we collect</h2>
          <p className="text-muted-foreground mb-2">
            We collect minimal information necessary to provide the service:
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Email address (only if you create an account)</li>
            <li>App usage data to improve the experience</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-2">How we use your data</h2>
          <p className="text-muted-foreground mb-2">Your data is used only for:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Account creation and authentication</li>
            <li>Syncing your picks and friends</li>
            <li>Improving app performance</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-2">Data sharing</h2>
          <p className="text-muted-foreground">We do not sell your data.</p>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-2">Guest users</h2>
          <p className="text-muted-foreground">
            If you use the app without creating an account, your data is stored
            locally on your device only and is not sent to our servers.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-2">Contact</h2>
          <p className="text-muted-foreground">
            For any questions, contact:{' '}
            <a
              href="mailto:support@fxracing.ca"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              support@fxracing.ca
            </a>
          </p>
        </div>
      </section>
    </main>
  )
}
