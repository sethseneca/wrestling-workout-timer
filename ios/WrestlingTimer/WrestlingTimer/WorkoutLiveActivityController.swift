import ActivityKit
import Foundation

@MainActor
final class WorkoutLiveActivityController {
    // The physical device consistently renders seven local updates before
    // throttling later phase changes. Keep every activity below that ceiling,
    // and overlap replacements during a Wrestle phase so a delayed scheduled
    // start never creates an empty Island or displays the wrong phase.
    private static let maximumUpdatesPerActivity = 6
    private static let maximumScheduledActivities = 3

    private var operationTask: Task<Void, Never>?
    private var isEnding = false

    var hasActiveActivity: Bool {
        !Self.currentActivities.isEmpty
    }

    func startWorkout(with states: [WorkoutActivityAttributes.ContentState]) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled, !states.isEmpty else { return }
        isEnding = false
        operationTask?.cancel()

        let oldActivities = Self.currentActivities
        operationTask = Task {
            for oldActivity in oldActivities {
                await oldActivity.end(nil, dismissalPolicy: .immediate)
            }
            guard !Task.isCancelled else { return }
            requestActivityShards(for: states)
        }
    }

    func updateIfActive(_ state: WorkoutActivityAttributes.ContentState) {
        let activities = Self.currentActivities
        guard !activities.isEmpty else { return }

        operationTask?.cancel()
        let updatedContent = content(for: state, relevanceScore: 100)
        operationTask = Task {
            for pendingActivity in activities where Self.isPending(pendingActivity) {
                await pendingActivity.end(nil, dismissalPolicy: .immediate)
            }
            if let activeActivity = activities
                .filter({ Self.isActive($0) && Self.contains($0, segmentIndex: state.segmentIndex) })
                .max(by: { $0.attributes.shardStartSegment < $1.attributes.shardStartSegment }) {
                await activeActivity.update(updatedContent)
                NSLog(
                    "Live Activity accepted paused update: phase=%@ segment=%d id=%@",
                    state.phase,
                    state.segmentIndex,
                    activeActivity.id
                )
            }
        }
    }

    nonisolated static func updateFromAudioBoundary(
        _ state: WorkoutActivityAttributes.ContentState
    ) {
        Task.detached(priority: .userInitiated) {
            let activeActivities = Activity<WorkoutActivityAttributes>.activities.filter {
                isActive($0) && contains($0, segmentIndex: state.segmentIndex)
            }

            // At an overlap segment, the incoming activity already contains
            // this exact phase and timer as its initial content. Update the
            // outgoing owner only; the incoming copy spends no update budget.
            let updateActivity = activeActivities
                .filter { $0.attributes.shardStartSegment != state.segmentIndex }
                .max(by: { $0.attributes.shardStartSegment < $1.attributes.shardStartSegment })

            let content = ActivityContent(
                state: state,
                staleDate: nil,
                relevanceScore: Double(100 + state.segmentIndex)
            )
            if let activity = updateActivity {
                await activity.update(content)
                NSLog(
                    "Live Activity accepted boundary: phase=%@ segment=%d remaining=%d id=%@",
                    state.phase,
                    state.segmentIndex,
                    state.remainingSeconds,
                    activity.id
                )

                // Only remove older shards after their replacement is active.
                // If iOS starts a scheduled activity late, the old content
                // remains visible instead of leaving a blank Dynamic Island.
                let expiredActivities = Activity<WorkoutActivityAttributes>.activities.filter {
                    isActive($0)
                        && $0.id != activity.id
                        && $0.attributes.shardEndSegment < state.segmentIndex
                }
                for expiredActivity in expiredActivities {
                    await expiredActivity.end(nil, dismissalPolicy: .immediate)
                }
            } else if activeActivities.contains(where: {
                $0.attributes.shardStartSegment == state.segmentIndex
            }) {
                NSLog(
                    "Live Activity replacement prewarmed: phase=%@ segment=%d",
                    state.phase,
                    state.segmentIndex
                )
            } else {
                NSLog(
                    "Live Activity boundary had no matching activity: phase=%@ segment=%d",
                    state.phase,
                    state.segmentIndex
                )
            }
        }
    }

    nonisolated static func endFromAudioBoundary(at workoutEnd: Date) {
        Task.detached(priority: .userInitiated) {
            let nanoseconds = UInt64(max(0, workoutEnd.timeIntervalSinceNow) * 1_000_000_000)
            if nanoseconds > 0 {
                try? await Task.sleep(nanoseconds: nanoseconds)
            }
            for activity in currentActivities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            NSLog("Live Activity ended at workout boundary")
        }
    }

    func end() {
        guard !isEnding else { return }
        let activities = Self.currentActivities
        guard !activities.isEmpty else { return }

        isEnding = true
        operationTask?.cancel()
        operationTask = Task {
            for activeActivity in activities {
                await activeActivity.end(nil, dismissalPolicy: .immediate)
            }
            isEnding = false
        }
    }

    nonisolated private static var currentActivities: [Activity<WorkoutActivityAttributes>] {
        Activity<WorkoutActivityAttributes>.activities.filter { isCurrent($0) }
    }

    private func requestActivityShards(
        for states: [WorkoutActivityAttributes.ContentState]
    ) {
        let shardStarts = shardStartOffsets(for: states)
        let shards = shardStarts.enumerated().map { position, start in
            let end = position + 1 < shardStarts.count
                ? shardStarts[position + 1]
                : states.count - 1
            return Array(states[start...end])
        }

        for (shardIndex, shard) in shards.enumerated() {
            guard let first = shard.first, let last = shard.last else { continue }
            let attributes = WorkoutActivityAttributes(
                workoutName: "Wrestling Timer",
                shardStartSegment: first.segmentIndex,
                shardEndSegment: last.segmentIndex
            )
            let shardContent = content(
                for: first,
                relevanceScore: Double(100 + first.segmentIndex)
            )

            do {
                let requestedActivity: Activity<WorkoutActivityAttributes>
                if shardIndex == 0 {
                    requestedActivity = try Activity.request(
                        attributes: attributes,
                        content: shardContent,
                        pushType: nil
                    )
                } else if #available(iOS 26.0, *) {
                    requestedActivity = try Activity.request(
                        attributes: attributes,
                        content: shardContent,
                        pushType: nil,
                        style: .standard,
                        alertConfiguration: AlertConfiguration(
                            title: "Workout continuing",
                            body: "The next workout block is starting.",
                            sound: .named("silent.caf")
                        ),
                        start: first.timerStart
                    )
                } else {
                    break
                }

                NSLog(
                    "Live Activity shard requested: shard=%d segments=%d-%d state=%@ id=%@",
                    shardIndex,
                    first.segmentIndex,
                    last.segmentIndex,
                    String(describing: requestedActivity.activityState),
                    requestedActivity.id
                )
            } catch {
                NSLog(
                    "Unable to request Live Activity shard %d: %@",
                    shardIndex,
                    error.localizedDescription
                )
            }
        }
    }

    private func shardStartOffsets(
        for states: [WorkoutActivityAttributes.ContentState]
    ) -> [Int] {
        guard !states.isEmpty else { return [] }
        var starts = [0]
        var currentStart = 0

        while states.count - 1 - currentStart > Self.maximumUpdatesPerActivity,
              starts.count < Self.maximumScheduledActivities {
            let searchEnd = min(
                currentStart + Self.maximumUpdatesPerActivity,
                states.count - 1
            )
            let nextStart = stride(from: searchEnd, through: currentStart + 1, by: -1)
                .first { isWrestleState(states[$0]) }
                ?? searchEnd
            starts.append(nextStart)
            currentStart = nextStart
        }
        return starts
    }

    private func isWrestleState(
        _ state: WorkoutActivityAttributes.ContentState
    ) -> Bool {
        state.phase != WorkoutPhase.ready.rawValue && state.phase != WorkoutPhase.rest.rawValue
    }

    private func content(
        for state: WorkoutActivityAttributes.ContentState,
        relevanceScore: Double
    ) -> ActivityContent<WorkoutActivityAttributes.ContentState> {
        ActivityContent(
            state: state,
            staleDate: nil,
            relevanceScore: relevanceScore
        )
    }

    nonisolated private static func contains(
        _ activity: Activity<WorkoutActivityAttributes>,
        segmentIndex: Int
    ) -> Bool {
        activity.attributes.shardStartSegment...activity.attributes.shardEndSegment ~= segmentIndex
    }

    nonisolated private static func isActive(
        _ activity: Activity<WorkoutActivityAttributes>
    ) -> Bool {
        activity.activityState == .active || activity.activityState == .stale
    }

    nonisolated private static func isPending(
        _ activity: Activity<WorkoutActivityAttributes>
    ) -> Bool {
        if #available(iOS 26.0, *) {
            return activity.activityState == .pending
        }
        return false
    }

    nonisolated private static func isCurrent(
        _ activity: Activity<WorkoutActivityAttributes>
    ) -> Bool {
        isActive(activity) || isPending(activity)
    }
}
