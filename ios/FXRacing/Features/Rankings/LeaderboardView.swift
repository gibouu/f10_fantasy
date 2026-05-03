import SwiftUI

struct LeaderboardView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(TutorialStore.self) private var tutorialStore
    @State private var vm = LeaderboardViewModel()
    @State private var showFriendSearch = false
    @State private var showSignIn = false

    var body: some View {
        Group {
            if vm.isLoading && vm.rows.isEmpty {
                leaderboardSkeleton
            } else if let err = vm.errorMessage, vm.rows.isEmpty {
                RetryView(message: err) { await vm.load(token: authManager.accessToken) }
            } else {
                list
            }
        }
        .navigationTitle("Rankings")
        .toolbar {
            ToolbarItem(placement: .principal) {
                scopePicker
            }
            if vm.scope == .friends {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if authManager.isAuthenticated { showFriendSearch = true }
                        else { showSignIn = true }
                    } label: {
                        Image(systemName: "person.badge.plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showFriendSearch, onDismiss: {
            Task { await vm.load(token: authManager.accessToken) }
        }) {
            FriendSearchView()
        }
        .sheet(isPresented: $showSignIn) {
            SignInPromptView(reason: "Sign in to add friends and see the Friends leaderboard.")
        }
        .task {
            guard authManager.isAuthenticated else { return }
            await vm.load(token: authManager.accessToken)
        }
        .refreshable {
            guard authManager.isAuthenticated else { return }
            await vm.load(token: authManager.accessToken)
        }
        .safeAreaInset(edge: .bottom) {
            if !tutorialStore.hasSeenLeaderboardTutorial && !authManager.isAuthenticated {
                TutorialCard(
                    icon: "trophy.fill",
                    title: "Global Rankings",
                    message: "Scores update after each race. Sign in to compete on the Friends leaderboard and track your rank."
                ) {
                    withAnimation(.spring(duration: 0.3)) {
                        tutorialStore.hasSeenLeaderboardTutorial = true
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
                    withAnimation(.spring(duration: 0.3)) {
                        tutorialStore.hasSeenFriendsTip = true
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
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
                guard authManager.isAuthenticated else { return }
                Task { await vm.load(token: authManager.accessToken) }
            }
        )) {
            ForEach(LeaderboardViewModel.Scope.allCases, id: \.self) {
                Text($0.label).tag($0)
            }
        }
        .pickerStyle(.segmented)
        .frame(width: 180)
    }

    @ViewBuilder
    private var list: some View {
        List {
            if !authManager.isAuthenticated {
                Section {
                    VStack(spacing: 16) {
                        Image(systemName: "trophy")
                            .font(.system(size: 40))
                            .foregroundStyle(FXTheme.Colors.accent)
                        Text("Sign in to view your ranking")
                            .font(.headline)
                        Text("Compete on the global and friends leaderboards by signing in.")
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
            } else if vm.rows.isEmpty {
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
                        ZStack {
                            NavigationLink(value: row.userId) { EmptyView() }.opacity(0)
                            LeaderboardRowView(row: row, isCurrentUser: isCurrent)
                        }
                    }
                }

                if let pinned = vm.userRow, !vm.rows.contains(where: { $0.id == pinned.id }) {
                    Section("Your rank") {
                        LeaderboardRowView(row: pinned, isCurrentUser: true)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: String.self) { userId in
            FriendProfileView(userId: userId)
        }
    }

    private var currentUserId: String? {
        if case .authenticated(let user) = authManager.state { return user.id }
        return nil
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
