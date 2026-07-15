/* eslint-disable @next/next/no-img-element -- official local badge stays byte-preserved */
import styles from "./site.module.css"

const APP_STORE_URL = "https://apps.apple.com/app/id6762099290"

type AppStoreLinkProps = {
  id: "landing-app-store-navigation" | "landing-app-store-hero"
  placement: "navigation" | "hero"
}

export function AppStoreLink({ id, placement }: AppStoreLinkProps) {
  const placementClass =
    placement === "navigation" ? styles.navigationStoreLink : styles.heroStoreLink

  return (
    <a
      id={id}
      className={`${styles.appStoreLink} ${placementClass}`}
      href={APP_STORE_URL}
      aria-label="Download FX Racing on the App Store"
    >
      <span className={styles.appStoreBadgeWrapper}>
        <img
          className={styles.appStoreBadge}
          src="/landing/download-on-the-app-store-black-en-us-v1.svg"
          alt=""
          width="250"
          height="83"
          decoding="async"
        />
      </span>
      <span className={styles.appStoreText}>View on the App Store</span>
    </a>
  )
}

export function SiteHeader() {
  return (
    <header className={styles.siteHeader}>
      <nav id="landing-navigation" className={`${styles.shell} ${styles.navigation}`}>
        <a className={styles.brand} href="/" aria-label="FX Racing home">
          <span>FX</span>
          <span className={styles.brandWord}>Racing</span>
        </a>
        <AppStoreLink id="landing-app-store-navigation" placement="navigation" />
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer id="landing-footer" className={styles.siteFooter}>
      <div className={`${styles.shell} ${styles.footerInner}`}>
        <nav className={styles.legalNavigation} aria-label="Legal and support">
          <a href="/privacy">Privacy</a>
          <a href="/privacy#terms">Terms</a>
          <a href="/support">Support</a>
        </nav>
        <div className={styles.footerNotices}>
          <p>
            FX Racing is an unofficial fan-made app and is not affiliated with Formula 1 or its
            related rights holders.
          </p>
          <p>
            Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other
            countries and regions. App Store is a service mark of Apple Inc.
          </p>
        </div>
      </div>
    </footer>
  )
}
