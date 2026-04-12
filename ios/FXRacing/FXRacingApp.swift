import SwiftUI

@main
struct FXRacingApp: App {
    @State private var authManager    = AuthManager()
    @State private var localPickStore = LocalPickStore()
    @State private var guestStore     = GuestStore()
    @State private var tutorialStore  = TutorialStore()

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
        }
    }
}
