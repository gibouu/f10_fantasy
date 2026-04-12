import SwiftUI

struct LeaderboardRowView: View {
    let row: LeaderboardRow
    var isCurrentUser = false

    var body: some View {
        HStack(spacing: 12) {
            // Rank
            Text("\(row.rank)")
                .font(.system(.subheadline, design: .rounded, weight: .bold))
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .trailing)

            // Avatar / team logo
            teamAvatar

            // Name + stats
            VStack(alignment: .leading, spacing: 2) {
                Text(row.publicUsername ?? "Player")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isCurrentUser ? Color.accentColor : .primary)
                HStack(spacing: 6) {
                    statChip(icon: "trophy.fill", value: row.winnerHits, color: .yellow)
                    statChip(icon: "10.circle.fill", value: row.exactTenthHits, color: .blue)
                    statChip(icon: "xmark.circle.fill", value: row.dnfHits, color: .orange)
                }
            }

            Spacer()

            // Total score
            Text("\(row.totalScore)")
                .font(.system(.headline, design: .rounded, weight: .bold))
                .foregroundStyle(isCurrentUser ? Color.accentColor : .primary)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var teamAvatar: some View {
        if let logoUrl = row.teamLogoUrl,
           let color = row.teamColor.flatMap({ Color(hex: $0) }) {
            AsyncImage(url: URL(string: Config.apiBaseURL.absoluteString + logoUrl)) { img in
                img.resizable().scaledToFit().padding(5)
            } placeholder: {
                ProgressView()
            }
            .frame(width: 36, height: 36)
            .background(color)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(.quaternary)
                .frame(width: 36, height: 36)
                .overlay {
                    Text(String(row.publicUsername?.prefix(1) ?? "?").uppercased())
                        .font(.caption.weight(.bold))
                }
        }
    }

    private func statChip(icon: String, value: Int, color: Color) -> some View {
        HStack(spacing: 2) {
            Image(systemName: icon).font(.system(size: 9)).foregroundStyle(color)
            Text("\(value)").font(.caption2).foregroundStyle(.secondary)
        }
    }
}
