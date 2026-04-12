import SwiftUI

struct RacesListView: View {
    @State private var viewModel = RacesListViewModel()
    @Environment(TutorialStore.self) private var tutorialStore
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.races.isEmpty {
                loadingSkeleton
            } else if let err = viewModel.errorMessage, viewModel.races.isEmpty {
                RetryView(message: err) { await viewModel.load() }
            } else if viewModel.races.isEmpty {
                ContentUnavailableView(
                    "No Races",
                    systemImage: "flag.2.crossed",
                    description: Text("No races scheduled this season.")
                )
            } else {
                VStack(spacing: 0) {
                    if let err = viewModel.errorMessage {
                        ErrorBanner(message: err) { viewModel.clearError() }
                            .padding(.top, 8)
                    }
                    raceList
                }
            }
        }
        .navigationTitle("Races")
        .navigationBarTitleDisplayMode(.large)
        .task { await viewModel.load() }
        .safeAreaInset(edge: .bottom) {
            if !tutorialStore.hasSeenWelcome && !authManager.isAuthenticated {
                TutorialCard(
                    icon: "flag.2.crossed.fill",
                    title: "Welcome to FX Racing",
                    message: "Tap any race to pick who wins, who finishes P10, and who DNFs. Earn points for correct calls!"
                ) {
                    withAnimation(.spring(duration: 0.3)) {
                        tutorialStore.hasSeenWelcome = true
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - Race list

    private var raceList: some View {
        List {
            if !viewModel.upcoming.isEmpty {
                Section {
                    ForEach(viewModel.upcoming) { race in
                        ZStack {
                            NavigationLink(value: race.id) { EmptyView() }.opacity(0)
                            RaceCardView(race: race)
                        }
                        .listRowInsets(.init(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                } header: {
                    sectionHeader("Upcoming")
                }
            }

            if !viewModel.past.isEmpty {
                Section {
                    ForEach(viewModel.past) { race in
                        ZStack {
                            NavigationLink(value: race.id) { EmptyView() }.opacity(0)
                            RaceCardView(race: race)
                        }
                        .listRowInsets(.init(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                } header: {
                    sectionHeader("Past Races")
                }
            }

        }
        .listStyle(.plain)
        .refreshable { await viewModel.load() }
        .navigationDestination(for: String.self) { raceId in
            RaceDetailView(raceId: raceId)
        }
    }

    // MARK: - Skeleton

    private var loadingSkeleton: some View {
        List {
            ForEach(0..<7, id: \.self) { _ in
                RaceCardSkeleton()
                    .padding(FXTheme.Spacing.md)
                    .background(FXTheme.Colors.surface)
                    .cornerRadius(FXTheme.Radius.lg)
                    .listRowInsets(.init(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(.secondary)
            .textCase(.uppercase)
            .tracking(1)
    }
}
