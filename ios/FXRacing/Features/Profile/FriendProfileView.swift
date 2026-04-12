import SwiftUI

struct FriendProfileView: View {
    let userId: String
    @Environment(AuthManager.self) private var authManager
    @State private var vm: FriendProfileViewModel

    init(userId: String) {
        self.userId = userId
        _vm = State(initialValue: FriendProfileViewModel(userId: userId))
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.profile == nil {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = vm.errorMessage, vm.profile == nil {
                ContentUnavailableView(err, systemImage: "wifi.slash")
            } else if let profile = vm.profile {
                content(profile)
            }
        }
        .navigationTitle(vm.profile?.user.publicUsername ?? "Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(token: authManager.accessToken) }
        .refreshable { await vm.load(token: authManager.accessToken) }
    }

    @ViewBuilder
    private func content(_ profile: FriendProfile) -> some View {
        List {
            // Header
            Section {
                HStack(spacing: 14) {
                    avatarView(profile.user)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(profile.user.publicUsername ?? "Player")
                            .font(.title3.weight(.bold))
                        Text("Season score: \(vm.totalScore) pts")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    addFriendButton(profile)
                }
                .padding(.vertical, 4)
            }

            // Picks
            if profile.canViewPicks {
                if profile.picks.isEmpty {
                    Section("Picks") {
                        Text("No picks yet.")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    }
                } else {
                    ForEach(profile.picks) { pick in
                        Section {
                            pickRow(pick)
                        } header: {
                            Text("R\(pick.race.round) · \(pick.race.name)")
                        }
                    }
                }
            } else {
                Section("Picks") {
                    Label("Picks are private — add as friend to view.", systemImage: "lock.fill")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func addFriendButton(_ profile: FriendProfile) -> some View {
        if let currentUser = authManager.authenticatedUser,
           currentUser.id != profile.user.id {
            if vm.requestSent {
                Text("Requested")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            } else {
                Button {
                    Task { await vm.sendFriendRequest(token: authManager.accessToken) }
                } label: {
                    if vm.isSendingRequest {
                        ProgressView()
                    } else {
                        Image(systemName: "person.badge.plus")
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
    }

    @ViewBuilder
    private func avatarView(_ user: ProfileUser) -> some View {
        if let teamSlug = user.favoriteTeamSlug,
           let logoUrl = "/teamlogos/\(teamSlug).webp" as String? {
            AsyncImage(url: URL(string: Config.apiBaseURL.absoluteString + logoUrl)) { img in
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
