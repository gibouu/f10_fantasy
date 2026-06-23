import SwiftUI

struct SettingsView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @AppStorage("colorSchemePreference") private var colorSchemePreference: String = "system"
    @State private var showSignOutConfirm = false
    @State private var showUsernameChange = false
    @State private var teamError: String? = nil
    @State private var showDeleteAccountWarn = false
    @State private var showDeleteAccountConfirm = false

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
                            ForEach(ProfileTeamOption.all) { team in
                                let currentSlug = authManager.authenticatedUser?.favoriteTeamSlug
                                let isSelected = currentSlug == team.slug
                                ProfileTeamChip(team: team, isSelected: isSelected) {
                                    Task {
                                        teamError = nil
                                        do {
                                            try await authManager.setFavoriteTeam(isSelected ? nil : team.slug)
                                        } catch {
                                            teamError = error.localizedDescription
                                        }
                                    }
                                }
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

                #if DEBUG
                Section("Developer") {
                    NavigationLink {
                        DiagnosticsView()
                    } label: {
                        Label {
                            Text("Diagnostics")
                        } icon: {
                            Image(systemName: "stethoscope")
                        }
                    }
                }
                #endif

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
        }
    }

}

struct UsernameChangeView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            UsernamePickerView(isChange: true) {
                dismiss()
            }
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
