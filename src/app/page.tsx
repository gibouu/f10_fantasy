/* eslint-disable @next/next/no-img-element -- versioned local assets avoid client image runtime */
import type { Metadata } from "next"
import { AppStoreLink, SiteFooter, SiteHeader } from "./site-chrome"
import styles from "./site.module.css"

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "FX Racing",
    images: [{ url: "/landing/fx-racing-race-deck-v1.jpg", width: 736, height: 1600 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/landing/fx-racing-race-deck-v1.jpg"],
  },
}

export default function RootPage() {
  return (
    <div className={styles.sitePage}>
      <SiteHeader />
      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy} data-review-id="landing-hero-copy">
            <p className={styles.eyebrow}>PICK THE GRID</p>
            <h1 id="landing-title" className={styles.heroTitle} aria-label="P1. P10. DNF.">
              <span aria-hidden="true">P1.</span>
              <span aria-hidden="true">P10.</span>
              <span aria-hidden="true">DNF.</span>
            </h1>
            <p className={styles.heroLead}>One race. Three calls. Global rankings.</p>
            <p className={styles.heroDetail}>
              Make all three picks before qualifying to unlock bonus points, then see your score and
              rank after the race.
            </p>
            <AppStoreLink id="landing-app-store-hero" placement="hero" />
          </div>

          <div
            id="landing-product-preview"
            className={styles.screenStage}
            data-review-id="landing-product-preview"
          >
            <figure
              className={`${styles.deviceFrame} ${styles.raceDeckFrame}`}
              data-review-id="landing-race-deck"
            >
              <img
                className={styles.deviceImage}
                src="/landing/fx-racing-race-deck-v1.jpg"
                alt="FX Racing race deck showing P1, P10, and DNF pick rows"
                width="736"
                height="1600"
                sizes="(min-width: 768px) 272px, 46vw"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </figure>
            <figure
              className={`${styles.deviceFrame} ${styles.driverPickerFrame}`}
              data-review-id="landing-driver-picker"
            >
              <img
                className={styles.deviceImage}
                src="/landing/fx-racing-driver-picker-v1.jpg"
                alt="FX Racing driver picker showing current driver and team imagery"
                width="736"
                height="1600"
                sizes="(min-width: 768px) 272px, 46vw"
                loading="lazy"
                decoding="async"
              />
            </figure>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
