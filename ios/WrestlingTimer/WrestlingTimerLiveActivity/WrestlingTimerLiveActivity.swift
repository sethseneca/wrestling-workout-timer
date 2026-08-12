import ActivityKit
import SwiftUI
import WidgetKit

@main
struct WrestlingTimerLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        WrestlingTimerLiveActivity()
    }
}

struct WrestlingTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            LockScreenWorkoutView(context: context)
                .activityBackgroundTint(.black.opacity(0.88))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.phase, systemImage: "timer")
                        .font(.subheadline.weight(.black))
                        .foregroundStyle(context.state.phaseColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text("ROUND \(context.state.round)/\(context.state.totalRounds)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.72))
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        CountdownText(state: context.state, font: .system(size: 38, weight: .black, design: .rounded))
                        WorkoutProgressView(state: context.state)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(context.state.phaseColor)
                    .accessibilityLabel(context.state.phase)
            } compactTrailing: {
                CountdownText(state: context.state, font: .caption.monospacedDigit().weight(.bold))
                    .frame(minWidth: 42)
            } minimal: {
                CountdownText(state: context.state, font: .caption2.monospacedDigit().weight(.bold))
                    .frame(minWidth: 36)
            }
            .keylineTint(context.state.phaseColor)
        }
    }
}

private struct LockScreenWorkoutView: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(context.state.phase)
                    .font(.headline.weight(.black))
                    .foregroundStyle(context.state.phaseColor)
                Text("Round \(context.state.round) of \(context.state.totalRounds)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.68))
            }

            Spacer(minLength: 8)

            CountdownText(
                state: context.state,
                font: .system(size: 34, weight: .black, design: .rounded)
            )
        }
        .padding(16)
        .foregroundStyle(.white)
    }
}

private struct CountdownText: View {
    let state: WorkoutActivityAttributes.ContentState
    let font: Font

    var body: some View {
        Group {
            if state.isRunning {
                Text(
                    timerInterval: state.timerStart...state.timerEnd,
                    countsDown: true,
                    showsHours: false
                )
            } else {
                Text(state.formattedRemainingTime)
            }
        }
        .font(font)
        .foregroundStyle(.white)
        .monospacedDigit()
        .lineLimit(1)
        .contentTransition(.numericText(countsDown: true))
        .accessibilityLabel(state.isRunning ? "Time remaining" : "Paused time remaining")
    }
}

private struct WorkoutProgressView: View {
    let state: WorkoutActivityAttributes.ContentState

    var body: some View {
        Group {
            if state.isRunning {
                ProgressView(timerInterval: state.timerStart...state.timerEnd, countsDown: true)
            } else {
                ProgressView(value: 0)
            }
        }
        .labelsHidden()
        .tint(state.phaseColor)
    }
}

private extension WorkoutActivityAttributes.ContentState {
    var phaseColor: Color {
        switch phase {
        case "GET READY": return .gray
        case "REST": return .green
        default: return .red
        }
    }

    var formattedRemainingTime: String {
        let clamped = max(0, remainingSeconds)
        return String(format: "%d:%02d", clamped / 60, clamped % 60)
    }
}
