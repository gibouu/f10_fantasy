export const metadata = {
  title: 'Privacy Policy – FX Racing',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-black mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">FX Racing</p>

      <section className="space-y-10 text-sm leading-relaxed">
        <div>
          <p className="text-muted-foreground">
            FX Racing respects your privacy. We collect only the information necessary to operate
            the app and provide core functionality, such as account authentication, syncing picks
            across devices, friend features, and app performance monitoring.
          </p>
          <p className="text-muted-foreground mt-3">
            We do not sell personal data. We do not use personal information for advertising
            purposes. Information may be processed only to operate, secure, maintain, and improve
            the app experience.
          </p>
          <p className="text-muted-foreground mt-3">
            If you sign in, your account information is used solely for authentication, saving your
            picks, and enabling social features such as adding friends and syncing across devices.
          </p>
          <p className="text-muted-foreground mt-3">
            By using the app, you acknowledge that data may be processed for these limited
            operational purposes.
          </p>
          <p className="text-muted-foreground mt-3">
            For privacy-related questions, contact:{' '}
            <a
              href="mailto:support@fxracing.ca"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              support@fxracing.ca
            </a>
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-3">Terms of Use</h2>
          <p className="text-muted-foreground">
            FX Racing is a fan-made motorsport prediction game intended for entertainment purposes
            only. The app allows users to make race-related picks and compete with friends in a
            private, recreational format.
          </p>
          <p className="text-muted-foreground mt-3">
            The app is provided &quot;as is&quot; without warranties of any kind, to the fullest
            extent permitted by applicable law. We do not guarantee uninterrupted availability,
            error-free operation, or absolute accuracy of all content, standings, or results.
          </p>
          <p className="text-muted-foreground mt-3">
            Users agree to use the app lawfully and respectfully. We may suspend or remove access
            in cases of abuse, misuse, interference with the service, or violations of these terms.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-3">Intellectual Property Notice</h2>
          <p className="text-muted-foreground">
            FX Racing is an unofficial, fan-created application and is not affiliated with,
            endorsed by, sponsored by, or approved by Formula 1, any Formula 1 team, any driver,
            or any related rights holder.
          </p>
          <p className="text-muted-foreground mt-3">
            Team names, driver names, logos, trademarks, images, colors, and other visual
            references remain the property of their respective owners.
          </p>
          <p className="text-muted-foreground mt-3">
            Any such references within the app are used solely for identification, commentary, and
            fan-experience presentation. If you are a rights holder and believe any content should
            be removed or modified, please contact us at{' '}
            <a
              href="mailto:support@fxracing.ca"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              support@fxracing.ca
            </a>{' '}
            and we will review the request promptly.
          </p>
        </div>
      </section>
    </main>
  )
}
