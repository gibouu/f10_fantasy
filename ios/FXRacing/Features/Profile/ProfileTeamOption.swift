import SwiftUI

/// iOS profile team choices. Slugs must match the backend team catalogue.
struct ProfileTeamOption: Identifiable, Sendable {
    let slug: String
    let name: String

    var id: String { slug }

    static let all: [ProfileTeamOption] = [
        ProfileTeamOption(slug: "ferrari", name: "Ferrari"),
        ProfileTeamOption(slug: "mclaren", name: "McLaren"),
        ProfileTeamOption(slug: "red-bull", name: "Red Bull"),
        ProfileTeamOption(slug: "mercedes", name: "Mercedes"),
        ProfileTeamOption(slug: "aston-martin", name: "Aston Martin"),
        ProfileTeamOption(slug: "alpine", name: "Alpine"),
        ProfileTeamOption(slug: "williams", name: "Williams"),
        ProfileTeamOption(slug: "racing-bulls", name: "Racing Bulls"),
        ProfileTeamOption(slug: "haas", name: "Haas"),
        ProfileTeamOption(slug: "audi", name: "Audi"),
        ProfileTeamOption(slug: "cadillac", name: "Cadillac"),
    ]
}

struct ProfileTeamChip: View {
    let team: ProfileTeamOption
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                AsyncImage(url: URL(string: Config.apiBaseURL.absoluteString + "/teamlogos/\(team.slug).webp")) { img in
                    img.resizable().scaledToFit().padding(5)
                } placeholder: {
                    Color.clear
                }
                .frame(width: 36, height: 36)
                .background(.quaternary)
                .clipShape(Circle())
                .overlay(Circle().stroke(isSelected ? FXTheme.Colors.accent : Color.clear, lineWidth: 2))

                Text(team.name)
                    .font(.system(size: 9, weight: isSelected ? .bold : .regular))
                    .foregroundStyle(isSelected ? FXTheme.Colors.accent : .secondary)
                    .lineLimit(1)
            }
            .frame(width: 58)
        }
        .buttonStyle(.plain)
    }
}
