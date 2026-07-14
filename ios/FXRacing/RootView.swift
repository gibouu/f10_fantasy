import SwiftUI

struct RootView: View {
    let raceDeckViewModel: RaceDeckViewModel
    let leaderboardAPI: any APIRequesting
    let launchToShellInterval: FXPerformanceSpan
    @Environment(AuthManager.self) private var authManager
    @Environment(LocalPickStore.self) private var localPickStore
    @Environment(TutorialStore.self) private var tutorialStore
    @AppStorage("colorSchemePreference") private var colorSchemePreference: String = "system"
    @State private var isShowingExpiredPickAlert = false
    @State private var expiredPickAlertCount = 0

    private var preferredColorScheme: ColorScheme? {
        switch colorSchemePreference {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil
        }
    }

    private var expiredPickAlertTitle: String {
        expiredPickAlertCount == 1 ? "Offline pick expired" : "Offline picks expired"
    }

    private var expiredPickAlertMessage: String {
        if expiredPickAlertCount == 1 {
            return "One offline pick could not sync because its race locked before you signed in."
        }
        return "\(expiredPickAlertCount) offline picks could not sync because their races locked before you signed in."
    }

    var body: some View {
        MainShellView(
            raceDeckViewModel: raceDeckViewModel,
            leaderboardAPI: leaderboardAPI,
            launchToShellInterval: launchToShellInterval
        )
        .preferredColorScheme(preferredColorScheme)
        .fullScreenCover(isPresented: usernameSetupRequired) {
            UsernamePickerView()
                .interactiveDismissDisabled()
        }
        .onChange(of: authManager.isAuthenticated) { _, isAuth in
            if isAuth { tutorialStore.markAllSeen() }
        }
        .onChange(of: localPickStore.expiredMigrationNoticeCount) { _, count in
            guard count > 0 else { return }
            expiredPickAlertCount = count
            isShowingExpiredPickAlert = true
        }
        .alert(expiredPickAlertTitle, isPresented: $isShowingExpiredPickAlert) {
            Button("OK", role: .cancel) {
                localPickStore.clearExpiredMigrationNotice()
            }
        } message: {
            Text(expiredPickAlertMessage)
        }
    }

    private var usernameSetupRequired: Binding<Bool> {
        Binding(
            get: {
                guard case .authenticated(let user) = authManager.state else {
                    return false
                }
                return !user.usernameSet
            },
            set: { _ in }
        )
    }
}
