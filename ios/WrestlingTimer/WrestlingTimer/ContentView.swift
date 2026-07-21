import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @State private var showingSetup = false

    var body: some View {
        ZStack {
            timer.phase.tint
                .ignoresSafeArea()

            HStack(spacing: 18) {
                VStack(spacing: 0) {
                    HStack {
                        Text("WRESTLING TIMER")
                            .font(.system(size: 16, weight: .black, design: .rounded))
                            .tracking(2)
                        Spacer()
                        Button { showingSetup = true } label: {
                            Image(systemName: "gearshape")
                                .font(.system(size: 24, weight: .bold))
                                .frame(width: 54, height: 54)
                                .background(.black.opacity(0.17), in: Circle())
                        }
                        .accessibilityLabel("Open workout setup")
                    }

                    Spacer()

                    VStack(spacing: 3) {
                        Text(timer.phase.rawValue)
                            .font(.system(size: 46, weight: .black, design: .rounded))
                        Text(timer.countdownText)
                            .font(.system(size: 170, weight: .black, design: .rounded))
                            .monospacedDigit()
                            .minimumScaleFactor(0.55)
                            .lineLimit(1)
                        Text(timer.isFinished ? "WORKOUT COMPLETE" : timer.roundText)
                            .font(.system(size: 20, weight: .black, design: .rounded))
                    }
                    .frame(maxWidth: .infinity)

                    Spacer()
                }

                controlRail
                    .frame(width: 116)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingSetup) {
            SetupView()
                .environmentObject(timer)
        }
    }

    private var controlRail: some View {
        VStack(spacing: 0) {
            railButton("arrow.counterclockwise", label: "Reset") { timer.reset() }
            railButton("backward.end.fill", label: "Previous interval") { timer.previousInterval() }
            Button { timer.startOrPause() } label: {
                Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                    .font(.system(size: 42, weight: .bold))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .foregroundStyle(.white)
            }
            .accessibilityLabel(timer.isRunning ? "Pause timer" : "Start timer")
            railButton("forward.end.fill", label: "Next interval") { timer.nextInterval() }
            railButton("speaker.wave.3.fill", label: "Whistle") { timer.whistle() }
        }
        .foregroundStyle(.white.opacity(0.7))
        .background(.black.opacity(0.97), in: Capsule())
    }

    private func railButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 29, weight: .semibold))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityLabel(label)
    }
}

private struct SetupView: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Intervals") {
                    Stepper("Wrestle: \(timer.settings.wrestleSeconds)s", value: wrestleSeconds, in: 1...3_600, step: 5)
                    Stepper("Rest: \(timer.settings.restSeconds)s", value: restSeconds, in: 0...3_600, step: 5)
                    Stepper("Get Ready: \(timer.settings.readySeconds)s", value: readySeconds, in: 0...120, step: 5)
                    Stepper("Rounds: \(timer.settings.rounds)", value: rounds, in: 1...99)
                }
                Section("Sound") {
                    HStack {
                        Text("Whistle volume")
                        Slider(value: volume, in: 0.25...2, step: 0.05)
                    }
                }
                Section {
                    Button("Apply and reset timer", role: .destructive) {
                        timer.reset()
                        dismiss()
                    }
                } footer: {
                    Text("Background cues use native iPhone audio and continue after you leave the app.")
                }
            }
            .navigationTitle("Workout Setup")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }

    private var wrestleSeconds: Binding<Int> { Binding(get: { timer.settings.wrestleSeconds }, set: { timer.settings.wrestleSeconds = $0 }) }
    private var restSeconds: Binding<Int> { Binding(get: { timer.settings.restSeconds }, set: { timer.settings.restSeconds = $0 }) }
    private var readySeconds: Binding<Int> { Binding(get: { timer.settings.readySeconds }, set: { timer.settings.readySeconds = $0 }) }
    private var rounds: Binding<Int> { Binding(get: { timer.settings.rounds }, set: { timer.settings.rounds = $0 }) }
    private var volume: Binding<Double> { Binding(get: { timer.settings.whistleVolume }, set: { timer.settings.whistleVolume = $0 }) }
}

private extension WorkoutPhase {
    var tint: Color {
        switch self {
        case .ready: return Color(red: 0.60, green: 0.50, blue: 0.32)
        case .wrestle: return Color(red: 0.95, green: 0.23, blue: 0.25)
        case .rest: return Color(red: 0.22, green: 1.0, blue: 0.53)
        }
    }
}
