import SwiftUI

private let allTeams: [(slug: String, name: String)] = [
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

struct SettingsView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @AppStorage("colorSchemePreference") private var colorSchemePreference: String = "system"
    @State private var showSignOutConfirm = false
    @State private var showUsernameChange = false
    @State private var teamError: String? = nil
    @State private var showDeleteAccountWarn = false
    @State private var showDeleteAccountConfirm = false
    @State private var showDiagnostics = false

    var body: some View {
        NavigationStack {
            List {
                Section("Appearance") {
                    Picker("Theme", selection: $colorSchemePreference) {
                        Text("System").tag("system")
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                    }
                    .pickerStyle(.segmented)
                }

                Section("Account") {
                    if let user = authManager.authenticatedUser {
                        LabeledContent("Username", value: user.publicUsername ?? "—")

                        if !user.usernameChangeUsed {
                            Button("Change Username") {
                                showUsernameChange = true
                            }
                        }
                    }
                }

                Section("Favourite Team") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(allTeams, id: \.slug) { team in
                                teamChip(team: team)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    if let err = teamError {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Section("Diagnostics") {
                    Button {
                        showDiagnostics = true
                    } label: {
                        HStack {
                            Image(systemName: "doc.text.magnifyingglass")
                                .foregroundStyle(FXTheme.Colors.accent)
                            Text("View logs")
                                .foregroundStyle(.primary)
                            Spacer()
                            Text("\(FXLogStore.shared.entries.count)")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Legal") {
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

                Section {
                    Button("Sign Out", role: .destructive) {
                        showSignOutConfirm = true
                    }
                }

                Section {
                    Button("Delete Account", role: .destructive) {
                        showDeleteAccountWarn = true
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Sign Out?", isPresented: $showSignOutConfirm) {
                Button("Sign Out", role: .destructive) {
                    authManager.signOut()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll need to sign in again to access your picks.")
            }
            .sheet(isPresented: $showUsernameChange) {
                UsernameChangeView()
            }
            .alert("Delete Account?", isPresented: $showDeleteAccountWarn) {
                Button("Continue", role: .destructive) {
                    showDeleteAccountConfirm = true
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently deletes your account and all associated data. This action cannot be undone.")
            }
            .sheet(isPresented: $showDeleteAccountConfirm) {
                DeleteAccountConfirmView()
            }
            .sheet(isPresented: $showDiagnostics) {
                DiagnosticsView()
            }
        }
    }

    private func teamChip(team: (slug: String, name: String)) -> some View {
        let currentSlug = authManager.authenticatedUser?.favoriteTeamSlug
        let isSelected = currentSlug == team.slug
        return Button {
            Task {
                teamError = nil
                do {
                    try await authManager.setFavoriteTeam(isSelected ? nil : team.slug)
                } catch {
                    teamError = error.localizedDescription
                }
            }
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

struct UsernameChangeView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            UsernamePickerView(isChange: true)
                .navigationTitle("Change Username")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
    }
}
