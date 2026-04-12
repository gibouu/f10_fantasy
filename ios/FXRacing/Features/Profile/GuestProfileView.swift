import SwiftUI

/// Profile tab content for unauthenticated (guest) users.
/// Local username and team avatar are stored in GuestStore (UserDefaults).
struct GuestProfileView: View {
    @Environment(GuestStore.self) private var guestStore
    @AppStorage("colorSchemePreference") private var colorSchemePreference: String = "system"
    @State private var showSignIn = false
    @State private var showTeamPicker = false
    @State private var usernameInput = ""
    @FocusState private var usernameFocused: Bool

    // All 2026 teams — slugs must match backend teams.ts exactly
    private let teams: [(slug: String, name: String)] = [
        ("ferrari",       "Ferrari"),
        ("mclaren",       "McLaren"),
        ("red-bull",      "Red Bull"),
        ("mercedes",      "Mercedes"),
        ("aston-martin",  "Aston Martin"),
        ("alpine",        "Alpine"),
        ("williams",      "Williams"),
        ("racing-bulls",  "Racing Bulls"),
        ("haas",          "Haas"),
        ("audi",          "Audi"),
        ("cadillac",      "Cadillac"),
    ]

    var body: some View {
        List {
            // Avatar section
            Section {
                HStack(spacing: 16) {
                    teamAvatar(guestStore.localTeamSlug)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(guestStore.localUsername.map { $0.isEmpty ? "Guest" : $0 } ?? "Guest")
                            .font(.title3.weight(.bold))
                        Text("Guest mode")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }

            // Local username
            Section("Display Name") {
                HStack {
                    TextField("Choose a display name", text: $usernameInput)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($usernameFocused)
                        .onChange(of: usernameInput) { _, val in
                            guestStore.localUsername = val.isEmpty ? nil : val
                        }
                    if !usernameInput.isEmpty {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(FXTheme.Colors.accent)
                    }
                }
                Text("Saved locally. Sign in to use it on the leaderboard.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Team / avatar picker
            Section("Favourite Team") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(teams, id: \.slug) { team in
                            teamChip(team: team)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            // Appearance
            Section("Appearance") {
                Picker("Theme", selection: $colorSchemePreference) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.segmented)
            }

            // Legal
            Section {
                Link(destination: URL(string: "https://fxracing.ca/privacy")!) {
                    HStack {
                        Text("Privacy Policy")
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Sign-in CTA
            Section {
                Button {
                    showSignIn = true
                } label: {
                    HStack {
                        Image(systemName: "person.crop.circle.badge.checkmark")
                            .foregroundStyle(FXTheme.Colors.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Sign in to unlock all features")
                                .font(.subheadline.weight(.semibold))
                            Text("Track scores, add friends, compete on the leaderboard.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }
                .foregroundStyle(.primary)
            }
        }
        .listStyle(.insetGrouped)
        .onAppear {
            usernameInput = guestStore.localUsername ?? ""
        }
        .sheet(isPresented: $showSignIn) {
            SignInPromptView(reason: "Sign in to save your profile, track your picks, and compete with friends.")
        }
    }

    @ViewBuilder
    private func teamAvatar(_ slug: String?) -> some View {
        if let slug {
            AsyncImage(url: URL(string: Config.apiBaseURL.absoluteString + "/teamlogos/\(slug).webp")) { img in
                img.resizable().scaledToFit().padding(6)
            } placeholder: {
                ProgressView()
            }
            .frame(width: 52, height: 52)
            .background(.quaternary)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(.quaternary)
                .frame(width: 52, height: 52)
                .overlay {
                    Image(systemName: "person.fill")
                        .foregroundStyle(.tertiary)
                        .font(.title3)
                }
        }
    }

    private func teamChip(team: (slug: String, name: String)) -> some View {
        let isSelected = guestStore.localTeamSlug == team.slug
        return Button {
            guestStore.localTeamSlug = isSelected ? nil : team.slug
        } label: {
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
