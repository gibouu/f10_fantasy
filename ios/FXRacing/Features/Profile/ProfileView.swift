import SwiftUI

struct ProfileView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var vm: FriendProfileViewModel? = nil
    @State private var showSettings = false

    var body: some View {
        Group {
            if authManager.isAuthenticated {
                if let profileVm = vm {
                    profileContent(profileVm)
                } else {
                    ProgressView()
                }
            } else {
                GuestProfileView()
            }
        }
        .onChange(of: authManager.authenticatedUser?.id) { _, userId in
            if let userId { vm = FriendProfileViewModel(userId: userId) }
            else { vm = nil }
        }
        .task {
            if let userId = authManager.authenticatedUser?.id, vm == nil {
                vm = FriendProfileViewModel(userId: userId)
            }
        }
        .navigationTitle("Me")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if authManager.isAuthenticated {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
    }

    @ViewBuilder
    private func profileContent(_ profileVm: FriendProfileViewModel) -> some View {
        Group {
            if profileVm.isLoading && profileVm.profile == nil {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = profileVm.errorMessage, profileVm.profile == nil {
                ContentUnavailableView(err, systemImage: "wifi.slash")
            } else if let profile = profileVm.profile {
                ownProfileList(profile, vm: profileVm)
            }
        }
        .task { await profileVm.load(token: authManager.accessToken) }
        .refreshable { await profileVm.load(token: authManager.accessToken) }
    }

    @ViewBuilder
    private func ownProfileList(_ profile: FriendProfile, vm: FriendProfileViewModel) -> some View {
        List {
            // Header
            Section {
                HStack(spacing: 14) {
                    avatarCircle(profile.user)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(profile.user.publicUsername ?? "Player")
                            .font(.title3.weight(.bold))
                        Text("Season total: \(vm.totalScore) pts")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            // Picks history
            if profile.picks.isEmpty {
                Section("My Picks") {
                    Text("No picks yet. Pick your drivers for upcoming races!")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
            } else {
                ForEach(profile.picks) { pick in
                    Section {
                        pickRow(pick)
                    } header: {
                        Text("\(pick.race.roundLabel) · \(pick.race.name)")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func avatarCircle(_ user: ProfileUser) -> some View {
        if let teamSlug = user.favoriteTeamSlug {
            AsyncImage(url: URL(string: Config.apiBaseURL.absoluteString + "/teamlogos/\(teamSlug).webp")) { img in
                img.resizable().scaledToFit().padding(6)
            } placeholder: {
                ProgressView()
            }
            .frame(width: 50, height: 50)
            .background(.quaternary)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(.quaternary)
                .frame(width: 50, height: 50)
                .overlay {
                    Text(String(user.publicUsername?.prefix(1) ?? "?").uppercased())
                        .font(.headline.weight(.bold))
                }
        }
    }

    private func pickRow(_ pick: ProfilePick) -> some View {
        VStack(spacing: 8) {
            HStack {
                slotCell(label: "P1", entry: pick.slotSummaries.winner)
                Divider()
                slotCell(label: "P10", entry: pick.slotSummaries.p10)
                Divider()
                slotCell(label: "DNF", entry: pick.slotSummaries.dnf)
            }
            .frame(height: 64)

            if let score = pick.scoreBreakdown {
                HStack {
                    Spacer()
                    Text("\(score.totalScore) pts")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func slotCell(label: String, entry: SlotEntry) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            if let driver = entry.driver {
                SlotDriverBubble(
                    code: driver.code,
                    photoURL: driver.photoFullURL,
                    teamColor: driver.color,
                    size: 36
                )
            } else {
                Circle()
                    .fill(.quaternary)
                    .frame(width: 36, height: 36)
                    .overlay { Text("—").font(.caption2).foregroundStyle(.tertiary) }
            }
            statusDot(entry.status)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func statusDot(_ status: String) -> some View {
        let color: Color = switch status {
        case "exact": .green
        case "correct", "partial": Color(red: 1, green: 0.8, blue: 0)
        case "miss": .red
        default: .gray
        }
        Circle()
            .fill(color)
            .frame(width: 6, height: 6)
    }
}
