import SwiftUI

struct SettingsView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @AppStorage("colorSchemePreference") private var colorSchemePreference: String = "system"
    @State private var showSignOutConfirm = false
    @State private var showUsernameChange = false

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

                Section {
                    Button("Sign Out", role: .destructive) {
                        showSignOutConfirm = true
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
        }
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
