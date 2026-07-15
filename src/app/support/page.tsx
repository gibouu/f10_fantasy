import type { Metadata } from "next"
import { SiteFooter, SiteHeader } from "../site-chrome"
import styles from "../site.module.css"

export const metadata: Metadata = {
  title: { absolute: "Support – FX Racing" },
  alternates: { canonical: "/support" },
  openGraph: { url: "/support" },
}

export default function SupportPage() {
  return (
    <div className={styles.sitePage}>
      <SiteHeader />
      <main className={styles.legalMain}>
        <article className={styles.legalArticle}>
          <p className={styles.legalEyebrow}>Contact</p>
          <h1>Support</h1>
          <p className={styles.legalBrand}>FX Racing</p>

          <section className={styles.supportCard}>
            <p>For support, bug reports, or legal inquiries, contact:</p>
            <p className={styles.supportAddress}>
              <a href="mailto:support@fxracing.ca">support@fxracing.ca</a>
            </p>
            <p>We are here to help.</p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
