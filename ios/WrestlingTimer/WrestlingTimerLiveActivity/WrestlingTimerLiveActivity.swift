import ActivityKit
import AppIntents
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
            LockScreenWorkoutView(state: context.presentation)
                .activityBackgroundTint(.black.opacity(0.88))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedWorkoutView(state: context.presentation)
                }
            } compactLeading: {
                CompactWorkoutView(state: context.presentation)
            } compactTrailing: {
                CompactRoundView(state: context.presentation)
            } minimal: {
                MinimalWorkoutView(state: context.presentation)
            }
            .keylineTint(.white.opacity(0.72))
        }
    }
}

private struct WorkoutActivityPresentation {
    let phase: String
    let round: Int
    let totalRounds: Int
    let timerStart: Date
    let timerEnd: Date
    let remainingSeconds: Int
    let isRunning: Bool
    let canGoBack: Bool
    let canAdvance: Bool

    init(context: ActivityViewContext<WorkoutActivityAttributes>) {
        let state = context.state
        phase = state.phase
        round = state.round
        totalRounds = state.totalRounds
        timerStart = state.timerStart
        timerEnd = state.timerEnd
        remainingSeconds = state.remainingSeconds
        isRunning = state.isRunning
        canGoBack = state.canGoBack
        canAdvance = state.canAdvance
    }
}

private extension ActivityViewContext where Attributes == WorkoutActivityAttributes {
    var presentation: WorkoutActivityPresentation {
        WorkoutActivityPresentation(context: self)
    }
}

private struct ExpandedWorkoutView: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        VStack(spacing: 7) {
            HStack(spacing: 10) {
                PhaseBadge(state: state)
                Spacer(minLength: 8)
                RoundBadge(state: state)
            }

            HStack(spacing: 10) {
                CountdownText(
                    state: state,
                    font: .system(size: 38, weight: .black, design: .rounded)
                )
                .invalidatableContent(true)
                Spacer(minLength: 4)
                ExpandedWorkoutControls(state: state)
            }

            WorkoutProgressView(state: state)
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 2)
    }
}

private struct PhaseBadge: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        Text("●  \(state.phase)")
        .font(.caption.weight(.black))
        .foregroundStyle(state.phaseColor)
        .lineLimit(1)
        .minimumScaleFactor(0.68)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(.white.opacity(0.08), in: Capsule())
        .overlay {
            Capsule().stroke(.white.opacity(0.18), lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct RoundBadge: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        Text("ROUND \(state.round) OF \(state.totalRounds)")
            .font(.caption.monospacedDigit().weight(.black))
            .foregroundStyle(.white)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(.white.opacity(0.08), in: Capsule())
            .overlay {
                Capsule().stroke(.white.opacity(0.16), lineWidth: 1)
            }
            .accessibilityLabel("Round \(state.round) of \(state.totalRounds)")
    }
}

private struct CompactWorkoutView: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        CountdownText(
            state: state,
            font: .system(size: 15, weight: .black, design: .rounded)
        )
        .font(.system(size: 15, weight: .black, design: .rounded).monospacedDigit())
        .fontWidth(.compressed)
        .lineLimit(1)
        .minimumScaleFactor(0.82)
        .padding(.leading, 4)
        .contentTransition(.numericText(countsDown: true))
        .accessibilityLabel("Time remaining")
    }
}

private struct CompactRoundView: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        Text(state.phase)
        .font(.system(size: 14, weight: .black, design: .rounded))
        .foregroundStyle(state.phaseColor)
        .fontWidth(.compressed)
        .lineLimit(1)
        .minimumScaleFactor(0.78)
        .padding(.trailing, 5)
        .accessibilityLabel(state.phase)
    }
}

private struct MinimalWorkoutView: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        CountdownText(
            state: state,
            font: .system(size: 15, weight: .black, design: .rounded)
        )
        .fontWidth(.compressed)
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .contentTransition(.numericText(countsDown: true))
        .accessibilityLabel("\(state.phase), time remaining")
    }
}

private struct ExpandedWorkoutControls: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        HStack(spacing: 7) {
            Button(intent: PreviousWorkoutIntervalIntent()) {
                Image(systemName: "backward.end.fill")
                    .frame(width: 32, height: 32)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white.opacity(state.canGoBack ? 0.92 : 0.30))
            .background(.white.opacity(state.canGoBack ? 0.10 : 0.04), in: Circle())
            .disabled(!state.canGoBack)
            .accessibilityLabel("Previous interval")

            Button(intent: ToggleWorkoutTimerIntent()) {
                Image(systemName: state.isRunning ? "pause.fill" : "play.fill")
                    .frame(width: 36, height: 36)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .font(.system(size: 16, weight: .black))
            .foregroundStyle(.white)
            .background(.white.opacity(0.16), in: Circle())
            .overlay {
                Circle().stroke(.white.opacity(0.48), lineWidth: 1.5)
            }
            .accessibilityLabel(state.isRunning ? "Pause timer" : "Resume timer")

            Button(intent: NextWorkoutIntervalIntent()) {
                Image(systemName: "forward.end.fill")
                    .frame(width: 32, height: 32)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white.opacity(state.canAdvance ? 0.92 : 0.34))
            .background(.white.opacity(state.canAdvance ? 0.10 : 0.04), in: Circle())
            .disabled(!state.canAdvance)
            .accessibilityLabel("Skip to next interval")

            Button(intent: ResetWorkoutTimerIntent()) {
                Image(systemName: "stop.fill")
                    .frame(width: 32, height: 32)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.red.opacity(0.90))
            .background(.red.opacity(0.12), in: Circle())
            .accessibilityLabel("Stop and reset timer")
        }
    }
}

private struct LockScreenWorkoutView: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(state.phase)
                    .font(.headline.weight(.black))
                    .foregroundStyle(state.phaseColor)
                Text("Round \(state.round) of \(state.totalRounds)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.68))
            }

            Spacer(minLength: 8)

            CountdownText(
                state: state,
                font: .system(size: 34, weight: .black, design: .rounded)
            )
        }
        .padding(16)
        .foregroundStyle(.white)
    }
}

private struct CountdownText: View {
    let state: WorkoutActivityPresentation
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
        .foregroundStyle(state.phaseColor)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.65)
        .contentTransition(.numericText(countsDown: true))
        .accessibilityLabel(state.isRunning ? "Time remaining" : "Paused time remaining")
    }
}

private struct WorkoutProgressView: View {
    let state: WorkoutActivityPresentation

    var body: some View {
        Group {
            if state.isRunning {
                ProgressView(timerInterval: state.timerStart...state.timerEnd, countsDown: true)
            } else {
                ProgressView(value: 0)
            }
        }
        .labelsHidden()
        .progressViewStyle(.linear)
        .tint(state.phaseColor)
        .scaleEffect(x: 1, y: 1.35)
        .invalidatableContent(true)
    }
}

private extension WorkoutActivityPresentation {
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
