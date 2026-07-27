import SwiftUI

struct ProfileView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var vm: FriendProfileViewModel? = nil
    @State private var showSettings = false
    @State private var expandedPickIDs: Set<String> = []

    private var profileRefreshKey: ProfileRefreshKey {
        ProfileRefreshKey(user: authManager.authenticatedUser)
    }

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
        .task(id: profileRefreshKey) { await profileVm.load(token: authManager.accessToken) }
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

            // Picks history — a season ledger. One row per race so the whole
            // season is scannable; drivers expand on tap rather than costing
            // vertical space on every row.
            Section("My picks") {
                if profile.picks.isEmpty {
                    Text("No picks yet. Pick your drivers for upcoming races!")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                } else {
                    ForEach(profile.picks) { pick in
                        ledgerRow(pick)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func avatarCircle(_ user: ProfileUser) -> some View {
        if let teamSlug = user.favoriteTeamSlug {
            FXRemoteImage(
                url: URL(string: Config.apiBaseURL.absoluteString + "/teamlogos/\(teamSlug).webp"),
                width: 38,
                height: 38,
                contentMode: .fit
            ) {
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

    /// One race per row: round, name, three outcome dots, points.
    ///
    /// Colour encodes **outcome**, not team. The previous layout ringed each
    /// driver photo in its team colour — decorative — while the question this
    /// screen answers is "did I score?", which was left to a 6pt dot.
    @ViewBuilder
    private func ledgerRow(_ pick: ProfilePick) -> some View {
        let isExpanded = expandedPickIDs.contains(pick.id)

        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.snappy(duration: 0.2)) {
                    if isExpanded { expandedPickIDs.remove(pick.id) }
                    else { expandedPickIDs.insert(pick.id) }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(pick.race.roundLabel)
                        .font(.caption.monospaced())
                        .foregroundStyle(.tertiary)
                        .frame(minWidth: 34, alignment: .leading)

                    Text(pick.race.name)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Spacer(minLength: 6)

                    HStack(spacing: 3) {
                        outcomeDot(pick.slotSummaries.winner.status)
                        outcomeDot(pick.slotSummaries.p10.status)
                        outcomeDot(pick.slotSummaries.dnf.status)
                    }

                    Text(pointsLabel(pick))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(pick.scoreBreakdown == nil ? .secondary : .primary)
                        .frame(minWidth: 46, alignment: .trailing)
                        .monospacedDigit()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(pick.race.roundLabel), \(pick.race.name)")
            .accessibilityValue(accessibilitySummary(pick))
            .accessibilityHint(isExpanded ? "Hides drivers" : "Shows drivers")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("picks-ledger-row-\(pick.id)")

            if isExpanded {
                VStack(spacing: 6) {
                    expandedSlot("P1", pick.slotSummaries.winner)
                    expandedSlot("P10", pick.slotSummaries.p10)
                    expandedSlot("DNF", pick.slotSummaries.dnf)
                }
                .padding(.top, 10)
                .transition(.opacity)
            }
        }
    }

    private func expandedSlot(_ label: String, _ entry: SlotEntry) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 34, alignment: .leading)

            outcomeDot(entry.status)

            Text(entry.driver.map { "\($0.firstName) \($0.lastName)" } ?? "No pick")
                .font(.caption)
                .foregroundStyle(entry.driver == nil ? .tertiary : .secondary)
                .lineLimit(1)

            Spacer(minLength: 4)

            Text(outcomeLabel(entry.status))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .accessibilityElement(children: .combine)
    }

    /// Colour encodes outcome, not team.
    ///
    /// Tokens are adaptive: system `.green` and a raw #FFCC00 sit at roughly
    /// 1.9:1 and 1.4:1 on white, so a partial hit was indistinguishable from
    /// an empty slot in light mode.
    private func outcomeColor(_ status: String) -> Color {
        switch status {
        case "exact": FXTheme.Colors.success
        case "correct", "partial": FXTheme.Colors.warning
        case "miss": FXTheme.Colors.danger
        default: Color(uiColor: .tertiaryLabel)
        }
    }

    private func outcomeLabel(_ status: String) -> String {
        switch status {
        case "exact": "Exact"
        case "correct", "partial": "Partial"
        case "miss": "Miss"
        default: "Pending"
        }
    }

    private func outcomeDot(_ status: String) -> some View {
        Circle()
            .fill(outcomeColor(status))
            .frame(width: 8, height: 8)
    }

    private func pointsLabel(_ pick: ProfilePick) -> String {
        guard let score = pick.scoreBreakdown else { return "—" }
        return "\(score.totalScore) pts"
    }

    private func accessibilitySummary(_ pick: ProfilePick) -> String {
        let slots = [
            ("P1", pick.slotSummaries.winner),
            ("P10", pick.slotSummaries.p10),
            ("DNF", pick.slotSummaries.dnf),
        ]
        let outcomes = slots
            .map { "\($0.0) \(outcomeLabel($0.1.status).lowercased())" }
            .joined(separator: ", ")
        guard let score = pick.scoreBreakdown else { return "\(outcomes). Not scored yet" }
        return "\(outcomes). \(score.totalScore) points"
    }

}

private struct ProfileRefreshKey: Equatable {
    let userId: String?
    let publicUsername: String?
    let favoriteTeamSlug: String?

    init(user: User?) {
        userId = user?.id
        publicUsername = user?.publicUsername
        favoriteTeamSlug = user?.favoriteTeamSlug
    }
}
