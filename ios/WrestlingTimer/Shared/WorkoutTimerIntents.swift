import AppIntents
import Foundation

@MainActor
enum WorkoutTimerCommandCenter {
    private static var toggleHandler: (() -> Void)?
    private static var previousIntervalHandler: (() -> Void)?
    private static var nextIntervalHandler: (() -> Void)?
    private static var resetHandler: (() -> Void)?

    static func register(
        toggle: @escaping () -> Void,
        previousInterval: @escaping () -> Void,
        nextInterval: @escaping () -> Void,
        reset: @escaping () -> Void
    ) {
        toggleHandler = toggle
        previousIntervalHandler = previousInterval
        nextIntervalHandler = nextInterval
        resetHandler = reset
    }

    static func toggle() {
        guard let toggleHandler else {
            NSLog("Workout timer toggle command arrived before the timer was ready")
            return
        }
        toggleHandler()
    }

    static func nextInterval() {
        guard let nextIntervalHandler else {
            NSLog("Workout timer next-interval command arrived before the timer was ready")
            return
        }
        nextIntervalHandler()
    }

    static func previousInterval() {
        guard let previousIntervalHandler else {
            NSLog("Workout timer previous-interval command arrived before the timer was ready")
            return
        }
        previousIntervalHandler()
    }

    static func reset() {
        guard let resetHandler else {
            NSLog("Workout timer reset command arrived before the timer was ready")
            return
        }
        resetHandler()
    }
}

struct PreviousWorkoutIntervalIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Return to previous workout interval"
    static var description = IntentDescription("Moves the active wrestling workout timer to its previous interval.")
    static var isDiscoverable = false

    @MainActor
    func perform() async throws -> some IntentResult {
        WorkoutTimerCommandCenter.previousInterval()
        return .result()
    }
}

struct ToggleWorkoutTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause or resume workout timer"
    static var description = IntentDescription("Pauses or resumes the active wrestling workout timer.")
    static var isDiscoverable = false

    @MainActor
    func perform() async throws -> some IntentResult {
        WorkoutTimerCommandCenter.toggle()
        return .result()
    }
}

struct ResetWorkoutTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Reset workout timer"
    static var description = IntentDescription("Stops and resets the active wrestling workout timer.")
    static var isDiscoverable = false

    @MainActor
    func perform() async throws -> some IntentResult {
        WorkoutTimerCommandCenter.reset()
        return .result()
    }
}

struct NextWorkoutIntervalIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip to next workout interval"
    static var description = IntentDescription("Moves the active wrestling workout timer to its next interval.")
    static var isDiscoverable = false

    @MainActor
    func perform() async throws -> some IntentResult {
        WorkoutTimerCommandCenter.nextInterval()
        return .result()
    }
}
