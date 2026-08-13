import SwiftUI
import UIKit

@main
struct WrestlingTimerApp: App {
    @UIApplicationDelegateAdaptor(WrestlingTimerAppDelegate.self) private var appDelegate
    @StateObject private var timer = WorkoutTimer()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(timer)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        timer.refresh(forceLiveActivitySync: true)
                    }
                }
        }
    }
}

@MainActor
final class WrestlingTimerAppDelegate: NSObject, UIApplicationDelegate {
    static var supportedOrientations: UIInterfaceOrientationMask = .allButUpsideDown

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        Self.supportedOrientations
    }
}

@MainActor
enum AppOrientationPolicy {
    private static var orientationBeforeSetup: UIInterfaceOrientation = .portrait

    static func lockSetupToPortrait() async -> Bool {
        guard let scene = activeWindowScene else { return false }

        orientationBeforeSetup = scene.interfaceOrientation
        WrestlingTimerAppDelegate.supportedOrientations = .portrait
        refreshSupportedOrientations(in: scene)
        request(.portrait, in: scene)

        for _ in 0..<20 {
            if scene.interfaceOrientation.isPortrait {
                return true
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }

        return scene.interfaceOrientation.isPortrait
    }

    static func restoreTimerOrientations() {
        guard let scene = activeWindowScene else {
            WrestlingTimerAppDelegate.supportedOrientations = .allButUpsideDown
            return
        }

        WrestlingTimerAppDelegate.supportedOrientations = .allButUpsideDown
        refreshSupportedOrientations(in: scene)

        let targetOrientation = interfaceOrientation(for: UIDevice.current.orientation)
            ?? orientationBeforeSetup
        if let targetMask = mask(for: targetOrientation) {
            request(targetMask, in: scene)
        }
    }

    private static var activeWindowScene: UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive })
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    }

    private static func refreshSupportedOrientations(in scene: UIWindowScene) {
        scene.windows.forEach {
            $0.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        }
    }

    private static func request(_ orientations: UIInterfaceOrientationMask, in scene: UIWindowScene) {
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: orientations)) { error in
            NSLog("Orientation update failed: %@", error.localizedDescription)
        }
    }

    private static func interfaceOrientation(for deviceOrientation: UIDeviceOrientation) -> UIInterfaceOrientation? {
        switch deviceOrientation {
        case .portrait:
            return .portrait
        case .landscapeLeft:
            return .landscapeRight
        case .landscapeRight:
            return .landscapeLeft
        default:
            return nil
        }
    }

    private static func mask(for orientation: UIInterfaceOrientation) -> UIInterfaceOrientationMask? {
        switch orientation {
        case .portrait:
            return .portrait
        case .landscapeLeft:
            return .landscapeLeft
        case .landscapeRight:
            return .landscapeRight
        default:
            return nil
        }
    }
}
