import ActivityKit
import Foundation

struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let phase: String
        let round: Int
        let totalRounds: Int
        let timerStart: Date
        let timerEnd: Date
        let remainingSeconds: Int
        let isRunning: Bool
    }

    let workoutName: String
}
