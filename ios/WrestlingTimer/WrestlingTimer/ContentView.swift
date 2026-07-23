import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @State private var showingSetup = false

    var body: some View {
        ZStack {
            timer.phase.tint
                .ignoresSafeArea()

            GeometryReader { geometry in
                VStack(spacing: 0) {
                    Color.black
                        .frame(height: geometry.size.height * timer.phaseProgress)
                    Spacer(minLength: 0)
                }
            }
            .ignoresSafeArea()
            .animation(.linear(duration: 0.1), value: timer.phaseProgress)

            timerReadout

            Text("WORKOUT TIMER")
                .font(fightFont(size: 17))
                .tracking(1.4)
                .shadow(color: .black.opacity(0.34), radius: 0, x: 1, y: 1.5)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.leading, 10)
                .padding(.top, 14)

            Button { showingSetup = true } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                    .frame(width: 60, height: 60)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open workout setup")
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            .padding(.leading, 2)
            .padding(.bottom, 8)

            controlRail
                .frame(width: 104)
                .padding(.vertical, 8)
                .padding(.trailing, 4)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                .ignoresSafeArea(.container, edges: .bottom)
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingSetup) {
            SetupView()
                .environmentObject(timer)
        }
    }

    private var timerReadout: some View {
        VStack(spacing: 1) {
            Text(timer.phaseTitle)
                .font(fightFont(size: 48))
                .tracking(0.5)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .offset(y: 22)

            Text(timer.countdownText)
                .font(fightFont(size: 222))
                .monospacedDigit()
                .minimumScaleFactor(0.55)
                .lineLimit(1)
                .offset(y: 36)

            Text(timer.isFinished ? "WORKOUT COMPLETE" : timer.roundText.uppercased())
                .font(fightFont(size: 48, weight: .heavy))
                .tracking(0.4)
        }
        .shadow(color: .black.opacity(0.40), radius: 0, x: 1.5, y: 2.5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 110)
    }

    private func fightFont(size: CGFloat, weight: UIFont.Weight = .black) -> Font {
        let athleticFont = UIFont(name: "DINCondensed-Bold", size: size)
            ?? UIFont.systemFont(ofSize: size, weight: weight, width: .compressed)
        return Font(athleticFont)
    }

    private var controlRail: some View {
        VStack(spacing: 0) {
            railButton("arrow.counterclockwise", size: 27, label: "Reset") { timer.reset() }
            railButton("backward.end.fill", label: "Previous interval") { timer.previousInterval() }
            Button { timer.startOrPause() } label: {
                ZStack {
                    Circle()
                        .fill(.white.opacity(timer.isRunning ? 0.16 : 0.12))
                        .frame(width: 72, height: 72)
                    Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                        .font(.system(size: 38, weight: .bold))
                        .symbolRenderingMode(.monochrome)
                        .foregroundStyle(.white)
                }
                .contentShape(Rectangle())
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(RailButtonStyle())
            .accessibilityLabel(timer.isRunning ? "Pause timer" : "Start timer")
            railButton("forward.end.fill", label: "Next interval") { timer.nextInterval() }
            railButton("speaker.wave.3.fill", size: 26, label: "Whistle") { timer.whistle() }
        }
        .foregroundStyle(.white.opacity(0.82))
        .background(.black.opacity(0.8), in: Capsule())
    }

    private func railButton(_ icon: String, size: CGFloat = 29, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Color.clear
                Image(systemName: icon)
                    .font(.system(size: size, weight: .bold))
                    .symbolRenderingMode(.monochrome)
                    .frame(width: 46, height: 46)
            }
            .contentShape(Rectangle())
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(RailButtonStyle())
        .accessibilityLabel(label)
    }
}

private struct RailButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.72 : 1)
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

private struct SetupView: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Intervals") {
                    VStack(spacing: 8) {
                        HStack(alignment: .top, spacing: 8) {
                            DurationSelector(
                                title: "Wrestle",
                                tint: WorkoutPhase.wrestle.tint,
                                seconds: wrestleSeconds,
                                range: 1...3_600
                            )
                            DurationSelector(
                                title: "Rest",
                                tint: WorkoutPhase.rest.tint,
                                seconds: restSeconds,
                                range: 0...3_600
                            )
                            DurationSelector(
                                title: "Get Ready",
                                tint: WorkoutPhase.ready.tint,
                                seconds: readySeconds,
                                range: 0...120
                            )
                        }

                        Label("Swipe wheels up or down", systemImage: "arrow.up.arrow.down")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)

                    Stepper(value: rounds, in: 1...99) {
                        HStack(spacing: 8) {
                            Text("ROUNDS")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                            Text("\(timer.settings.rounds)")
                                .font(.title3.weight(.bold))
                                .monospacedDigit()
                        }
                    }
                }
                Section("Timer Text") {
                    TextField("Wrestle label", text: wrestleLabel)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
                Section("Sound") {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Whistle volume")
                            Spacer()
                            Text("\(Int((timer.settings.whistleVolume * 100).rounded()))%")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                            Button("Test") { timer.whistle() }
                                .buttonStyle(.bordered)
                        }
                        Slider(value: whistleVolume, in: 0...2, step: 0.05)
                            .accessibilityLabel("Whistle volume")
                            .accessibilityValue("\(Int((timer.settings.whistleVolume * 100).rounded())) percent")
                    }
                    Toggle("10-second warning", isOn: tenSecondWarningEnabled)
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Warning volume")
                            Spacer()
                            Text("\(Int((timer.settings.tenSecondWarningVolume * 100).rounded()))%")
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                            Button("Test") { timer.warning() }
                                .buttonStyle(.bordered)
                        }
                        Slider(value: warningVolume, in: 0...3, step: 0.05)
                            .accessibilityLabel("Warning volume")
                            .accessibilityValue("\(Int((timer.settings.tenSecondWarningVolume * 100).rounded())) percent")
                    }
                    .disabled(!timer.settings.tenSecondWarningEnabled)
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
    private var whistleVolume: Binding<Double> { Binding(get: { timer.settings.whistleVolume }, set: { timer.setWhistleVolume($0) }) }
    private var warningVolume: Binding<Double> { Binding(get: { timer.settings.tenSecondWarningVolume }, set: { timer.setTenSecondWarningVolume($0) }) }
    private var wrestleLabel: Binding<String> { Binding(get: { timer.settings.wrestleLabel }, set: { timer.settings.wrestleLabel = $0 }) }
    private var tenSecondWarningEnabled: Binding<Bool> { Binding(get: { timer.settings.tenSecondWarningEnabled }, set: { timer.settings.tenSecondWarningEnabled = $0 }) }
}

private struct DurationSelector: View {
    @EnvironmentObject private var timer: WorkoutTimer
    let title: String
    let tint: Color
    @Binding var seconds: Int
    let range: ClosedRange<Int>

    var body: some View {
        VStack(spacing: 6) {
            Text(title.uppercased())
                .font(.subheadline.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(tint)
                .frame(maxWidth: .infinity)

            HStack(alignment: .center, spacing: 6) {
                VStack(spacing: 2) {
                    Text("MIN")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Picker("Minutes", selection: minutes) {
                        ForEach(0...maximumMinutes, id: \.self) { minute in
                            Text("\(minute)")
                                .monospacedDigit()
                                .tag(minute)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.wheel)
                    .frame(width: 88, height: 108)
                    .clipped()
                    .background(.black.opacity(0.14), in: RoundedRectangle(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(tint.opacity(0.28), lineWidth: 1)
                    }
                    .accessibilityLabel("\(title) minutes")
                }

                Text(":")
                    .font(.title2.bold())
                    .padding(.top, 14)

                VStack(spacing: 2) {
                    Text("SEC")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Picker("Seconds", selection: secondsPart) {
                        ForEach(0...59, id: \.self) { second in
                            Text(String(format: "%02d", second))
                                .monospacedDigit()
                                .tag(second)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.wheel)
                    .frame(width: 88, height: 108)
                    .clipped()
                    .background(.black.opacity(0.14), in: RoundedRectangle(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(tint.opacity(0.28), lineWidth: 1)
                    }
                    .accessibilityLabel("\(title) seconds")
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .sensoryFeedback(.selection, trigger: seconds)
        .onChange(of: seconds) { oldValue, newValue in
            guard oldValue != newValue else { return }
            timer.wheelClick()
        }
    }

    private var maximumMinutes: Int {
        range.upperBound / 60
    }

    private var minutes: Binding<Int> {
        Binding(
            get: { seconds / 60 },
            set: { update(minutes: $0, secondsPart: seconds % 60) }
        )
    }

    private var secondsPart: Binding<Int> {
        Binding(
            get: { seconds % 60 },
            set: { update(minutes: seconds / 60, secondsPart: $0) }
        )
    }

    private func update(minutes: Int, secondsPart: Int) {
        let requested = minutes * 60 + secondsPart
        seconds = min(max(requested, range.lowerBound), range.upperBound)
    }
}

private extension WorkoutPhase {
    var tint: Color {
        switch self {
        case .ready: return Color(red: 0.41, green: 0.44, blue: 0.48)
        case .wrestle: return Color(red: 0.95, green: 0.23, blue: 0.25)
        case .rest: return Color(red: 0.08, green: 0.58, blue: 0.30)
        }
    }
}
