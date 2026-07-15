import type { Metadata } from "next"
import { SiteFooter, SiteHeader } from "../site-chrome"
import styles from "../site.module.css"

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy – FX Racing" },
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy" },
}

export default function PrivacyPage() {
  return (
    <div className={styles.sitePage}>
      <SiteHeader />
      <main className={styles.legalMain}>
        <article className={styles.legalArticle}>
          <p className={styles.legalEyebrow}>Legal</p>
          <h1>Privacy Policy</h1>
          <p className={styles.legalBrand}>FX Racing</p>

          <div className={styles.legalSections}>
            <section className={styles.legalSection}>
              <p>
                FX Racing respects your privacy. We collect only the information necessary to
                operate the app and provide core functionality, such as account authentication,
                syncing picks across devices, friend features, and app performance monitoring.
              </p>
              <p>
                We do not sell personal data. We do not use personal information for advertising
                purposes. Information may be processed only to operate, secure, maintain, and
                improve the app experience.
              </p>
              <p>
                If you sign in, your account information is used solely for authentication, saving
                your picks, and enabling social features such as adding friends and syncing across
                devices.
              </p>
              <p>
                By using the app, you acknowledge that data may be processed for these limited
                operational purposes.
              </p>
              <p>
                For privacy-related questions, contact:{" "}
                <a className={styles.legalLink} href="mailto:support@fxracing.ca">
                  support@fxracing.ca
                </a>
              </p>
            </section>

            <section id="terms" className={styles.legalSection}>
              <h2>Terms of Use</h2>
              <p>
                FX Racing is a fan-made motorsport prediction game intended for entertainment
                purposes only. The app allows users to make race-related picks and compete with
                friends in a private, recreational format.
              </p>
              <p>
                The app is provided &quot;as is&quot; without warranties of any kind, to the fullest
                extent permitted by applicable law. We do not guarantee uninterrupted availability,
                error-free operation, or absolute accuracy of all content, standings, or results.
              </p>
              <p>
                Users agree to use the app lawfully and respectfully. We may suspend or remove
                access in cases of abuse, misuse, interference with the service, or violations of
                these terms.
              </p>
            </section>

            <section className={styles.legalSection}>
              <h2>Intellectual Property Notice</h2>
              <p>
                FX Racing is an unofficial, fan-created application and is not affiliated with,
                endorsed by, sponsored by, or approved by Formula 1, any Formula 1 team, any
                driver, or any related rights holder.
              </p>
              <p>
                Team names, driver names, logos, trademarks, images, colors, and other visual
                references remain the property of their respective owners.
              </p>
              <p>
                Any such references within the app are used solely for identification, commentary,
                and fan-experience presentation. If you are a rights holder and believe any content
                should be removed or modified, please contact us at{" "}
                <a className={styles.legalLink} href="mailto:support@fxracing.ca">
                  support@fxracing.ca
                </a>{" "}
                and we will review the request promptly.
              </p>
            </section>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
