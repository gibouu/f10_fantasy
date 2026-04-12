import UIKit

@MainActor
enum Haptics {
    /// Light tap — selecting a driver in the picker.
    static func select() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Medium impact — saving a pick set.
    static func pick() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    /// Heavy thud — race locked (can't pick anymore).
    static func locked() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    }

    /// Success notification — pick submitted successfully.
    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// Error notification — submission failed.
    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    /// Score reveal — rigid double-tap feel.
    static func scoreReveal() {
        let gen = UIImpactFeedbackGenerator(style: .rigid)
        gen.impactOccurred()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 80_000_000)
            gen.impactOccurred(intensity: 0.5)
        }
    }
}
