import SwiftUI

/// Circular driver avatar with a team-colour ring.
/// Shared by pick bubbles, leaderboard rows, and friend profiles.
struct DriverBubbleView: View {
    let driver: Driver?
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(FXTheme.Colors.surfaceElevated)
                .frame(width: size, height: size)
                .overlay(
                    Circle().stroke(
                        driver?.teamColor ?? Color.secondary.opacity(0.25),
                        lineWidth: 2
                    )
                )

            if let driver {
                if let url = driver.photoFullURL {
                    AsyncImage(url: url) { phase in
                        if case .success(let image) = phase {
                            image
                                .resizable()
                                .scaledToFill()
                                .frame(width: size, height: size)
                                .clipShape(Circle())
                        } else {
                            codeLabel(driver)
                        }
                    }
                } else {
                    codeLabel(driver)
                }
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.38))
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(width: size, height: size)
        .shadow(color: (driver?.teamColor ?? Color.clear).opacity(0.45), radius: size * 0.18, x: 0, y: size * 0.10)
        .shadow(color: .black.opacity(0.18), radius: size * 0.10, x: 0, y: size * 0.06)
    }

    private func codeLabel(_ driver: Driver) -> some View {
        Text(driver.code)
            .font(.system(size: size * 0.28, weight: .black))
            .foregroundStyle(.primary)
    }
}

/// Lightweight bubble for `SlotDriver` (used in profile pick history).
struct SlotDriverBubble: View {
    let code: String
    let photoURL: URL?
    let teamColor: Color
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(FXTheme.Colors.surfaceElevated)
                .frame(width: size, height: size)
                .overlay(Circle().stroke(teamColor, lineWidth: 2))

            if let url = photoURL {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFill()
                            .frame(width: size, height: size)
                            .clipShape(Circle())
                    } else {
                        Text(code)
                            .font(.system(size: size * 0.28, weight: .black))
                    }
                }
            } else {
                Text(code)
                    .font(.system(size: size * 0.28, weight: .black))
            }
        }
        .frame(width: size, height: size)
        .shadow(color: teamColor.opacity(0.45), radius: size * 0.18, x: 0, y: size * 0.10)
        .shadow(color: .black.opacity(0.18), radius: size * 0.10, x: 0, y: size * 0.06)
    }
}
