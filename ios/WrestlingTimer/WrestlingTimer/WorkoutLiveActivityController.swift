import ActivityKit
import Foundation

@MainActor
final class WorkoutLiveActivityController {
    private var activity: Activity<WorkoutActivityAttributes>?
    private var operationTask: Task<Void, Never>?
    private var isEnding = false

    init() {
        activity = Self.currentActivities.first
    }

    var hasActiveActivity: Bool {
        resolvedActivity != nil
    }

    func startOrUpdate(_ state: WorkoutActivityAttributes.ContentState) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        isEnding = false

        if let activity = resolvedActivity {
            update(activity, state: state)
            return
        }

        do {
            activity = try Activity.request(
                attributes: WorkoutActivityAttributes(workoutName: "Wrestling Timer"),
                content: content(for: state),
                pushType: nil
            )
        } catch {
            NSLog("Unable to start Wrestling Timer Live Activity: %@", error.localizedDescription)
        }
    }

    func updateIfActive(_ state: WorkoutActivityAttributes.ContentState) {
        guard let activity = resolvedActivity else { return }
        update(activity, state: state)
    }

    func end() {
        guard !isEnding else { return }
        let activities = Self.currentActivities
        guard activity != nil || !activities.isEmpty else { return }

        isEnding = true
        activity = nil
        operationTask?.cancel()
        operationTask = Task {
            for activeActivity in activities {
                await activeActivity.end(nil, dismissalPolicy: .immediate)
            }
            isEnding = false
        }
    }

    private static var currentActivities: [Activity<WorkoutActivityAttributes>] {
        Activity<WorkoutActivityAttributes>.activities.filter {
            $0.activityState == .active || $0.activityState == .stale
        }
    }

    private var resolvedActivity: Activity<WorkoutActivityAttributes>? {
        if let activity, activity.activityState == .active || activity.activityState == .stale {
            return activity
        }
        activity = Self.currentActivities.first
        return activity
    }

    private func update(
        _ activity: Activity<WorkoutActivityAttributes>,
        state: WorkoutActivityAttributes.ContentState
    ) {
        operationTask?.cancel()
        let updatedContent = content(for: state)
        operationTask = Task {
            await activity.update(updatedContent)
        }
    }

    private func content(
        for state: WorkoutActivityAttributes.ContentState
    ) -> ActivityContent<WorkoutActivityAttributes.ContentState> {
        ActivityContent(
            state: state,
            staleDate: state.isRunning ? state.timerEnd : nil,
            relevanceScore: 100
        )
    }
}
