import SwiftUI

/// Inline error banner shown below navigation, dismissable.
struct ErrorBanner: View {
    let message: String
    var onDismiss: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
                .font(.subheadline)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.primary)
                .lineLimit(2)
            Spacer()
            if let onDismiss {
                Button { onDismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color(uiColor: .secondarySystemBackground))
        .overlay(
            RoundedRectangle(cornerRadius: FXTheme.Radius.md)
                .stroke(Color.yellow.opacity(0.4), lineWidth: 1)
        )
        .cornerRadius(FXTheme.Radius.md)
        .padding(.horizontal, FXTheme.Spacing.md)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// Full-screen retry state for when loading fails entirely.
struct RetryView: View {
    let message: String
    let onRetry: () async -> Void
    @State private var isRetrying = false

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                isRetrying = true
                Task {
                    await onRetry()
                    isRetrying = false
                }
            } label: {
                Group {
                    if isRetrying {
                        ProgressView()
                    } else {
                        Text("Retry")
                    }
                }
                .frame(width: 100, height: 40)
                .background(FXTheme.Colors.accent)
                .foregroundStyle(.black)
                .cornerRadius(FXTheme.Radius.md)
            }
            .disabled(isRetrying)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
