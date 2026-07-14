import SwiftUI

@main
struct FXRacingApp: App {
    @Environment(\.scenePhase) private var scenePhase
    private let syncManager: SyncManager
    @State private var authManager: AuthManager
    @State private var localPickStore = LocalPickStore()
    @State private var guestStore     = GuestStore()
    @State private var tutorialStore  = TutorialStore()

    @MainActor
    init() {
        let syncManager = SyncManager()
        self.syncManager = syncManager
        _authManager = State(
            initialValue: AuthManager(syncManager: syncManager)
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authManager)
                .environment(localPickStore)
                .environment(guestStore)
                .environment(tutorialStore)
                .task {
                    // Wire stores before restoring session so migration has access to them
                    authManager.localPickStore = localPickStore
                    authManager.guestStore     = guestStore
                    await authManager.restoreSession()
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task { await authManager.handleForeground() }
                }
        }
    }
}
