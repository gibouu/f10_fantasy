import SwiftUI

/// Dismissable floating hint card shown as a `.safeAreaInset(edge: .bottom)` overlay.
struct TutorialCard: View {
    let icon: String
    let title: String
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(FXTheme.Colors.accent)
                .frame(width: 28)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .padding(6)
                    .background(Color.secondary.opacity(0.12))
                    .clipShape(Circle())
            }
        }
        .padding(FXTheme.Spacing.md)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: FXTheme.Radius.lg))
        .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        .padding(.horizontal, FXTheme.Spacing.md)
        .padding(.bottom, 8)
    }
}
