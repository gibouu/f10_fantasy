import SwiftUI

struct LeaderboardView: View {
    private struct SelectedPlayer: Identifiable {
        let id: String
    }

    @Environment(AuthManager.self) private var authManager
    @Environment(TutorialStore.self) private var tutorialStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Bindable var vm: LeaderboardViewModel
    @State private var showFriendSearch = false
    @State private var showSignIn = false
    @State private var selectedPlayer: SelectedPlayer?

    init(viewModel: LeaderboardViewModel) {
        self.vm = viewModel
    }

    var body: some View {
        VStack(spacing: 0) {
            leaderboardControls
                .padding(.horizontal, FXTheme.Spacing.md)
                .padding(.vertical, 10)

            Group {
                if isFriendsAccountBlocked {
                    list
                } else if vm.isLoading && vm.rows.isEmpty {
                    leaderboardSkeleton
                } else if let err = vm.errorMessage, vm.rows.isEmpty {
                    RetryView(message: err) { await loadIfAllowed() }
                } else {
                    list
                }
            }
        }
        .sheet(isPresented: $showFriendSearch, onDismiss: {
            Task { await loadIfAllowed() }
        }) {
            FriendSearchView()
        }
        .sheet(isPresented: $showSignIn) {
            SignInPromptView(reason: "Sign in to add friends and see the Friends leaderboard.")
        }
        .sheet(item: $selectedPlayer) { player in
            NavigationStack {
                FriendProfileView(userId: player.id)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Done") { selectedPlayer = nil }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .task {
            await loadIfAllowed()
        }
        .onChange(of: authManager.state) { _, state in
            guard vm.scope == .friends else { return }
            switch state {
            case .authenticated:
                Task { await loadIfAllowed() }
            case .unknown, .unauthenticated, .accountUnavailable:
                vm.clearBlockedFriendsContent()
            }
        }
        .refreshable {
            await loadIfAllowed()
        }
        .safeAreaInset(edge: .bottom) {
            if !tutorialStore.hasSeenLeaderboardTutorial && isSignedOut {
                TutorialCard(
                    icon: "trophy.fill",
                    title: "Global Rankings",
                    message: "Scores update after each race. Sign in to compete on the Friends leaderboard and track your rank."
                ) {
                    if reduceMotion {
                        tutorialStore.hasSeenLeaderboardTutorial = true
                    } else {
                        withAnimation(.spring(duration: 0.3)) {
                            tutorialStore.hasSeenLeaderboardTutorial = true
                        }
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if vm.scope == .friends && !authManager.isAuthenticated && tutorialStore.hasSeenLeaderboardTutorial {
                EmptyView()
            } else if vm.scope == .friends && !tutorialStore.hasSeenFriendsTip && authManager.isAuthenticated {
                TutorialCard(
                    icon: "person.badge.plus",
                    title: "Add friends",
                    message: "Tap the + button to search for friends by username and add them to your leaderboard."
                ) {
                    if reduceMotion {
                        tutorialStore.hasSeenFriendsTip = true
                    } else {
                        withAnimation(.spring(duration: 0.3)) {
                            tutorialStore.hasSeenFriendsTip = true
                        }
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private var leaderboardControls: some View {
        HStack(spacing: 10) {
            scopePicker

            if vm.scope == .friends {
                Button {
                    if authManager.isAuthenticated {
                        showFriendSearch = true
                    } else if isSignedOut {
                        showSignIn = true
                    }
                } label: {
                    Image(systemName: "person.badge.plus")
                        .frame(width: 34, height: 28)
                }
                .buttonStyle(.bordered)
                .disabled(!authManager.isAuthenticated && !isSignedOut)
                .accessibilityLabel("Add Friend")
            }
        }
    }

    private var scopePicker: some View {
        Picker("Scope", selection: Binding(
            get: { vm.scope },
            set: { newScope in
                // Update synchronously so the segmented picker reflects the
                // tap immediately — avoids a visible bounce-back while the
                // async load runs.
                vm.scope = newScope
                Task { await loadIfAllowed() }
            }
        )) {
            ForEach(LeaderboardViewModel.Scope.allCases, id: \.self) {
                Text($0.label).tag($0)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("rankings-scope-picker")
    }

    @ViewBuilder
    private var list: some View {
        List {
            if vm.scope == .friends {
                switch authManager.state {
                case .unknown:
                    accountCheckingSection
                case .accountUnavailable:
                    accountUnavailableSection
                case .unauthenticated:
                    signInSection
                case .authenticated:
                    leaderboardSections
                }
            } else {
                leaderboardSections
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private var accountCheckingSection: some View {
        Section {
            VStack(spacing: 12) {
                ProgressView()
                Text("Checking your account…")
                    .font(.headline)
                Text("Global rankings remain available while your account is restored.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
        }
    }

    @ViewBuilder
    private var accountUnavailableSection: some View {
        Section {
            VStack(spacing: 12) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 36))
                    .foregroundStyle(.secondary)
                Text("Account unavailable")
                    .font(.headline)
                Text("Your public rankings and device picks are still available.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Retry") {
                    Task { await retryAccount() }
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("account-retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
        }
    }

    @ViewBuilder
    private var signInSection: some View {
        Section {
            VStack(spacing: 16) {
                Image(systemName: "person.2")
                    .font(.system(size: 40))
                    .foregroundStyle(FXTheme.Colors.accent)
                Text("Sign in to view friends")
                    .font(.headline)
                Text("Global rankings are public. Sign in to add friends and compare private leaderboards.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Sign In") { showSignIn = true }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(FXTheme.Colors.onAccent)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(FXTheme.Colors.accent)
                    .clipShape(Capsule())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
        }
    }

    @ViewBuilder
    private var leaderboardSections: some View {
        if vm.rows.isEmpty {
            Section {
                ContentUnavailableView(
                    vm.scope == .friends ? "No friends yet" : "No rankings yet",
                    systemImage: vm.scope == .friends ? "person.2.slash" : "trophy",
                    description: vm.scope == .friends
                        ? Text("Use the + button to add friends.")
                        : nil
                )
            }
        } else {
            Section {
                ForEach(vm.rows) { row in
                    let isCurrent = row.userId == currentUserId
                    // A `Button` with `.buttonStyle(.plain)` wrapping this
                    // custom label did not deliver taps inside the List — the
                    // action never ran, so the profile sheet never opened.
                    // (Plain-text buttons elsewhere in the same List work, and
                    // the sheet itself works, so it was specific to this
                    // combination.) A tap gesture on the row content is
                    // reliable; the button trait keeps the row exposed as a
                    // button to VoiceOver and UI tests.
                    LeaderboardRowView(row: row, isCurrentUser: isCurrent)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedPlayer = SelectedPlayer(id: row.userId)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier("ranking-row-\(row.userId)")
                }
            }

            if let pinned = vm.userRow, !vm.rows.contains(where: { $0.id == pinned.id }) {
                Section("Your rank") {
                    LeaderboardRowView(row: pinned, isCurrentUser: true)
                }
            }
        }
    }

    private var isSignedOut: Bool {
        if case .unauthenticated = authManager.state { return true }
        return false
    }

    private var isFriendsAccountBlocked: Bool {
        guard vm.scope == .friends else { return false }
        switch authManager.state {
        case .authenticated:
            return false
        case .unknown, .unauthenticated, .accountUnavailable:
            return true
        }
    }

    private func retryAccount() async {
        await authManager.retrySession()
        await loadIfAllowed()
    }

    private var currentUserId: String? {
        if case .authenticated(let user) = authManager.state { return user.id }
        return nil
    }

    private func loadIfAllowed() async {
        guard vm.scope == .global || authManager.isAuthenticated else { return }
        await vm.load(token: authManager.accessToken)
    }

    private var leaderboardSkeleton: some View {
        List {
            Section {
                ForEach(0..<10, id: \.self) { _ in
                    LeaderboardRowSkeleton()
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}
