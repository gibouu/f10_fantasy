import SwiftUI

struct MainShellView: View {
    @Bindable var raceDeckViewModel: RaceDeckViewModel
    let launchToShellInterval: FXPerformanceSpan

    @Environment(AuthManager.self) private var authManager
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedSection: MainShellSection = .upcoming
    @State private var isShowingProfile = false
    @State private var hasStartedRaceDeck = false
    @State private var sectionSwitchInterval: FXPerformanceSpan?
    @State private var leaderboardViewModel: LeaderboardViewModel
    @State private var legacyRecoveryPresentationSession =
        LegacyRecoveryPresentationSession()

    init(
        raceDeckViewModel: RaceDeckViewModel,
        leaderboardAPI: any APIRequesting,
        launchToShellInterval: FXPerformanceSpan
    ) {
        self.raceDeckViewModel = raceDeckViewModel
        self.launchToShellInterval = launchToShellInterval
        _leaderboardViewModel = State(
            initialValue: LeaderboardViewModel(client: leaderboardAPI)
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            shellHeader
                .padding(.horizontal, FXTheme.Spacing.md)
                .padding(.top, 8)

            HomeSectionPicker(selection: sectionSelection)
                .padding(.horizontal, FXTheme.Spacing.md)
                .padding(.vertical, 12)

            Divider()

            selectedContent
        }
        .background(Color(uiColor: .systemBackground))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("main-shell")
        .onAppear {
            launchToShellInterval.end()
        }
        .sheet(isPresented: $isShowingProfile) {
            profileSheet
        }
        .task {
            guard !hasStartedRaceDeck else { return }
            hasStartedRaceDeck = true
            await raceDeckViewModel.start()
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled else { return }
                if scenePhase == .active {
                    await raceDeckViewModel.pollLiveRaces()
                }
            }
        }
        .onChange(of: selectedSection) { _, section in
            switch section {
            case .upcoming:
                raceDeckViewModel.setActiveSection(.upcoming)
            case .past:
                raceDeckViewModel.setActiveSection(.past)
            case .rankings:
                raceDeckViewModel.setActiveSection(nil)
            }
        }
        .onChange(of: privateScopeID) { _, privateScopeID in
            raceDeckViewModel.setPrivateScope(privateScopeID)
        }
    }

    private var sectionSelection: Binding<MainShellSection> {
        Binding(
            get: { selectedSection },
            set: { section in
                guard section != selectedSection else { return }
                sectionSwitchInterval?.end()
                sectionSwitchInterval = FXPerformance.begin(.sectionSwitch)
                selectedSection = section
            }
        )
    }

    private var privateScopeID: String {
        authManager.authenticatedUser.map { "user:\($0.id)" } ?? "device"
    }

    private var shellHeader: some View {
        HStack {
            HStack(spacing: 8) {
                Image(systemName: "flag.checkered")
                    .foregroundStyle(FXTheme.Colors.accent)
                Text("F10")
                    .font(.title2.weight(.black))
                    .tracking(-0.5)
            }

            Spacer()

            Button {
                isShowingProfile = true
            } label: {
                profileButtonLabel
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Circle())
                    .fxGlassControl(radius: 22)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Profile")
            .accessibilityIdentifier("profile-button")
        }
        .frame(minHeight: 44)
    }

    @ViewBuilder
    private var profileButtonLabel: some View {
        switch authManager.state {
        case .unknown:
            ProgressView()
                .controlSize(.small)
        case .accountUnavailable:
            Image(systemName: "person.crop.circle.badge.exclamationmark")
                .font(.title3)
        case .unauthenticated:
            Image(systemName: "person.crop.circle")
                .font(.title3)
        case .authenticated(let user):
            Text(String(user.displayName.prefix(1)).uppercased())
                .font(.subheadline.weight(.bold))
        }
    }

    @ViewBuilder
    private var selectedContent: some View {
        switch selectedSection {
        case .upcoming:
            RaceDeckView(
                viewModel: raceDeckViewModel,
                legacyRecoveryPresentationSession: legacyRecoveryPresentationSession,
                section: .upcoming
            )
                .onAppear { finishSectionSwitch() }
        case .past:
            RaceDeckView(
                viewModel: raceDeckViewModel,
                legacyRecoveryPresentationSession: legacyRecoveryPresentationSession,
                section: .past
            )
                .onAppear { finishSectionSwitch() }
        case .rankings:
            LeaderboardView(viewModel: leaderboardViewModel)
                .onAppear { finishSectionSwitch() }
        }
    }

    private func finishSectionSwitch() {
        sectionSwitchInterval?.end()
        sectionSwitchInterval = nil
    }

    private var profileSheet: some View {
        NavigationStack {
            profileContent
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Done") { isShowingProfile = false }
                    }
                }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private var profileContent: some View {
        switch authManager.state {
        case .unknown:
            VStack(spacing: 12) {
                ProgressView()
                Text("Checking your account…")
                    .font(.headline)
                Text("Your races and device picks remain available.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Profile")

        case .accountUnavailable:
            ContentUnavailableView {
                Label("Account unavailable", systemImage: "wifi.exclamationmark")
            } description: {
                Text("Your races and device picks remain available. Retry account access when you’re ready.")
            } actions: {
                Button("Retry") {
                    Task {
                        await authManager.retrySession(races: raceDeckViewModel.races)
                    }
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("account-retry")
            }
            .navigationTitle("Profile")

        case .unauthenticated:
            GuestProfileView()
                .navigationTitle("Profile")

        case .authenticated:
            ProfileView()
        }
    }
}
