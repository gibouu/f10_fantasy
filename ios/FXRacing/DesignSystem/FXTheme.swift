import SwiftUI

// MARK: - Card surface modifier

extension View {
    /// Card surface for the current Xcode 16/iOS 17+ toolchain.
    func fxCardSurface(radius: CGFloat = FXTheme.Radius.lg) -> some View {
        modifier(FXCardSurfaceModifier(radius: radius))
    }
}

private struct FXCardSurfaceModifier: ViewModifier {
    let radius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(FXTheme.Colors.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(FXTheme.Colors.cardBorder(isSelected: false), lineWidth: 1)
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
        /// Adaptive: the original #C9A227 is tuned for dark surfaces and only
        /// reaches 2.4:1 on white, which is too weak for the small monospaced
        /// score numerals it labels. Dark mode keeps the original value.
        static let gold = Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.79, green: 0.64, blue: 0.15, alpha: 1)
                : UIColor(red: 0.55, green: 0.42, blue: 0.02, alpha: 1)
        })
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

        /// Status colours that hold contrast on BOTH a white and a black
        /// surface. The system `.yellow` and `.green` are tuned for dark
        /// backgrounds — on white they land near 1.3:1 and 1.9:1, so a status
        /// dot painted with them simply disappears in light mode.
        static let warning = Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.00, green: 0.84, blue: 0.20, alpha: 1)
                : UIColor(red: 0.72, green: 0.52, blue: 0.00, alpha: 1)
        })

        static let success = Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.35, green: 0.85, blue: 0.42, alpha: 1)
                : UIColor(red: 0.11, green: 0.48, blue: 0.18, alpha: 1)
        })

        /// Card edge that stays visible in both modes.
        ///
        /// A hardcoded white stroke disappears on a light card, which is what
        /// made the race card lose its edge in light mode and left the fill
        /// gradient reading as a stray line.
        static func cardBorder(isSelected: Bool) -> Color {
            Color(uiColor: UIColor { traits in
                let isDark = traits.userInterfaceStyle == .dark
                let alpha: CGFloat = isSelected ? 0.16 : 0.09
                return isDark
                    ? UIColor(white: 1, alpha: alpha)
                    : UIColor(white: 0, alpha: alpha)
            })
        }

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
