import ActivityKit
import Foundation

struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable, Sendable {
        let phase: String
        let round: Int
        let totalRounds: Int
        let timerStart: Date
        let timerEnd: Date
        let remainingSeconds: Int
        let isRunning: Bool
        let canGoBack: Bool
        let canAdvance: Bool
        let segmentIndex: Int
    }

    let workoutName: String
    let shardStartSegment: Int
    let shardEndSegment: Int
}
