import SwiftUI

struct FriendSearchView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var vm = FriendsViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var showSignIn = false

    var body: some View {
        NavigationStack {
            List {
                // Pending received requests
                if !vm.pendingReceived.isEmpty {
                    Section("Friend Requests") {
                        ForEach(vm.pendingReceived) { request in
                            pendingReceivedRow(request)
                        }
                    }
                }

                // Search results
                if !vm.searchQuery.isEmpty {
                    Section("Results") {
                        if vm.isSearching {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                        } else if let err = vm.errorMessage {
                            Text(err)
                                .foregroundStyle(.red)
                                .font(.subheadline)
                        } else if vm.searchResults.isEmpty {
                            Text("No users found")
                                .foregroundStyle(.secondary)
                                .font(.subheadline)
                        } else {
                            ForEach(vm.searchResults) { user in
                                searchResultRow(user)
                            }
                        }
                    }
                } else if !vm.friends.isEmpty {
                    Section("Friends") {
                        ForEach(vm.friends) { friend in
                            friendRow(friend)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .searchable(text: $vm.searchQuery, prompt: "Search by username")
            .onChange(of: vm.searchQuery) {
                vm.onSearchQueryChange(token: authManager.accessToken)
            }
            .task { await vm.loadFriends(token: authManager.accessToken) }
            .sheet(isPresented: $showSignIn) {
                SignInPromptView(reason: "Sign in to add friends and see their picks.")
            }
        }
    }

    private func friendRow(_ user: UserSummary) -> some View {
        NavigationLink(destination: FriendProfileView(userId: user.id)) {
            userRow(
                username: user.publicUsername,
                avatarUrl: user.avatarUrl,
                teamLogoUrl: user.teamLogoUrl,
                teamColor: user.teamColor
            )
        }
    }

    private func searchResultRow(_ user: UserSummary) -> some View {
        HStack {
            userRow(
                username: user.publicUsername,
                avatarUrl: user.avatarUrl,
                teamLogoUrl: user.teamLogoUrl,
                teamColor: user.teamColor
            )
            Spacer()
            if vm.sentRequestIds.contains(user.id) {
                Text("Pending")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            } else if !vm.friends.contains(where: { $0.id == user.id }) {
                Button {
                    if authManager.isAuthenticated {
                        Task { await vm.sendFriendRequest(to: user.id, token: authManager.accessToken) }
                    } else {
                        showSignIn = true
                    }
                } label: {
                    Image(systemName: "person.badge.plus")
                        .font(.subheadline)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        }
    }

    private func pendingReceivedRow(_ request: FriendRequest) -> some View {
        HStack {
            userRow(
                username: request.requesterUsername,
                avatarUrl: request.requesterAvatar,
                teamLogoUrl: request.teamLogoUrl,
                teamColor: request.teamColor
            )
            Spacer()
            HStack(spacing: 8) {
                Button {
                    Task { await vm.accept(request.id, token: authManager.accessToken) }
                } label: {
                    Image(systemName: "checkmark")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)

                Button {
                    Task { await vm.reject(request.id, token: authManager.accessToken) }
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .controlSize(.small)
            }
        }
    }

    @ViewBuilder
    private func userRow(
        username: String?,
        avatarUrl: String?,
        teamLogoUrl: String?,
        teamColor: String?
    ) -> some View {
        HStack(spacing: 10) {
            avatarCircle(logoUrl: teamLogoUrl, color: teamColor, fallback: username)
            Text(username ?? "Unknown")
                .font(.subheadline.weight(.medium))
        }
    }

    @ViewBuilder
    private func avatarCircle(logoUrl: String?, color: String?, fallback: String?) -> some View {
        if let logoUrl, let hexColor = color, let teamColor = Color(hex: hexColor) {
            AsyncImage(url: URL(string: Config.apiBaseURL.absoluteString + logoUrl)) { img in
                img.resizable().scaledToFit().padding(4)
            } placeholder: {
                ProgressView()
            }
            .frame(width: 32, height: 32)
            .background(teamColor)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(.quaternary)
                .frame(width: 32, height: 32)
                .overlay {
                    Text(String(fallback?.prefix(1) ?? "?").uppercased())
                        .font(.caption.weight(.bold))
                }
        }
    }
}
