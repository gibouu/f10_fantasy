import SwiftUI

/// Animated shimmer placeholder for loading states.
struct SkeletonView: View {
    let width: CGFloat?
    let height: CGFloat
    let cornerRadius: CGFloat

    @State private var phase: CGFloat = 0

    init(width: CGFloat? = nil, height: CGFloat = 16, cornerRadius: CGFloat = 6) {
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(shimmer)
            .frame(width: width, height: height)
            .onAppear {
                withAnimation(
                    .linear(duration: 1.4).repeatForever(autoreverses: false)
                ) { phase = 1 }
            }
    }

    private var shimmer: LinearGradient {
        LinearGradient(
            gradient: Gradient(stops: [
                .init(color: .secondary.opacity(0.12), location: phase - 0.3),
                .init(color: .secondary.opacity(0.24), location: phase),
                .init(color: .secondary.opacity(0.12), location: phase + 0.3),
            ]),
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}

// MARK: - Compound skeletons

struct RaceCardSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            SkeletonView(width: 34, height: 34, cornerRadius: 17)
            VStack(alignment: .leading, spacing: 8) {
                SkeletonView(width: 140, height: 14)
                SkeletonView(width: 90, height: 11)
            }
            Spacer()
            SkeletonView(width: 60, height: 24, cornerRadius: 8)
        }
        .padding(.vertical, 4)
    }
}

struct LeaderboardRowSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            SkeletonView(width: 28, height: 14)
            SkeletonView(width: 36, height: 36, cornerRadius: 18)
            VStack(alignment: .leading, spacing: 6) {
                SkeletonView(width: 100, height: 13)
                SkeletonView(width: 70, height: 10)
            }
            Spacer()
            SkeletonView(width: 40, height: 18, cornerRadius: 6)
        }
        .padding(.vertical, 4)
    }
}
