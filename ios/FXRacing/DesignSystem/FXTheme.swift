import SwiftUI

// MARK: - Liquid Glass surface modifier

extension View {
    /// Card surface: .glassEffect on iOS 26+, FXTheme.Colors.surface + cornerRadius on iOS 17-25.
    func fxCardSurface(radius: CGFloat = FXTheme.Radius.lg) -> some View {
        modifier(FXCardSurfaceModifier(radius: radius))
    }
}

private struct FXCardSurfaceModifier: ViewModifier {
    let radius: CGFloat

    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content
                .glassEffect(.regular, in: RoundedRectangle(cornerRadius: radius))
        } else {
            content
                .background(FXTheme.Colors.surface)
                .cornerRadius(radius)
        }
    }
}

enum FXTheme {

    enum Colors {
        /// F1 matte red — primary brand color and action tint.
        static let accent = Color(red: 0.85, green: 0.04, blue: 0.02)
        /// Text color to use on top of accent-colored backgrounds.
        static let onAccent: Color = .white
        /// #C9A227 — gold, used for P10 exact hits.
        static let gold   = Color(red: 0.79, green: 0.64, blue: 0.15)
        /// #ff453a — danger/DNF red.
        static let danger = Color(red: 1.00, green: 0.27, blue: 0.23)

        /// Dark-mode aware card surface (matches web --color-surface).
        static let surface = Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.12, alpha: 1)
                : UIColor(white: 0.97, alpha: 1)
        })

        /// Elevated card layer (matches web --color-surface-elevated).
        static let surfaceElevated = Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.17, alpha: 1)
                : .white
        })

        static let textPrimary   = Color.primary
        static let textSecondary = Color.secondary
        static let textTertiary  = Color(uiColor: .tertiaryLabel)
    }

    enum Radius {
        static let sm: CGFloat  =  8
        static let md: CGFloat  = 14
        static let lg: CGFloat  = 20
        static let xl: CGFloat  = 28
    }

    enum Spacing {
        static let xs: CGFloat  =  4
        static let sm: CGFloat  =  8
        static let md: CGFloat  = 16
        static let lg: CGFloat  = 24
        static let xl: CGFloat  = 32
    }
}
