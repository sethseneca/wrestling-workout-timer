import SwiftUI

@main
struct WrestlingTimerApp: App {
    @StateObject private var timer = WorkoutTimer()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(timer)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { timer.refresh() }
                }
        }
    }
}
