import SwiftUI

struct RaceCardView: View {
    let race: Race

    var body: some View {
        HStack(spacing: 12) {
            // Round badge — appends "S" for sprint rows so a shared-round
            // weekend (R9 British Sprint + R9 British GP) is distinguishable.
            Text(race.roundLabel)
                .font(.system(size: 12, weight: .black, design: .monospaced))
                .foregroundStyle(FXTheme.Colors.textTertiary)
                .frame(width: 36, alignment: .center)

            // Race name + circuit
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(race.flagEmoji)
                    Text(race.name)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    if race.isSprint {
                        Text("SPRINT")
                            .font(.system(size: 9, weight: .black))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(FXTheme.Colors.gold.opacity(0.18))
                            .foregroundStyle(FXTheme.Colors.gold)
                            .cornerRadius(4)
                    }
                }
                Text(race.circuitName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            // Status + date
            VStack(alignment: .trailing, spacing: 4) {
                StatusBadge(status: race.status)
                Text(race.scheduledStartUtc.formatted(.dateTime.month(.abbreviated).day()))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .fxCardSurface()
    }
}
