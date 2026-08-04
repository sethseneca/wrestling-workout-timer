import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @State private var showingSetup = false
    @State private var showingSoundboard = false
    @State private var showingTimeEditor = false

    var body: some View {
        ZStack {
            timer.color(for: timer.phase)
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
                .padding(.leading, showingSoundboard ? 112 : 0)
                .padding(.trailing, showingSoundboard ? 326 : 0)
                .animation(.easeInOut(duration: 0.22), value: showingSoundboard)

            Button { showingSetup = true } label: {
                ZStack {
                    Circle()
                        .fill(.black.opacity(0.8))

                    Image(systemName: "gearshape")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundStyle(.white.opacity(0.9))
                }
                .frame(width: 64, height: 64)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open workout setup")
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            .padding(.trailing, 2)
            .padding(.bottom, 8)
            .opacity(showingSoundboard ? 0 : 1)
            .allowsHitTesting(!showingSoundboard)

            controlRail
                .frame(width: 104)
                .padding(.vertical, 8)
                .padding(.leading, 4)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .ignoresSafeArea(.container, edges: .bottom)

            if showingSoundboard {
                SoundboardPanel()
                    .environmentObject(timer)
                    .frame(width: 318)
                    .padding(.vertical, 8)
                    .padding(.trailing, 4)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingSetup) {
            SetupView()
                .environmentObject(timer)
        }
        .sheet(isPresented: $showingTimeEditor) {
            CurrentTimeEditorView(initialSeconds: timer.remainingSeconds) { seconds in
                timer.setCurrentRemainingSeconds(seconds)
            }
        }
    }

    private var timerReadout: some View {
        VStack(spacing: 1) {
            Text(timer.phaseTitle)
                .font(fightFont(size: showingSoundboard ? 34 : 48))
                .tracking(0.5)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .offset(y: showingSoundboard ? 8 : 22)

            Text(timer.countdownText)
                .font(fightFont(size: showingSoundboard ? 126 : 222))
                .monospacedDigit()
                .minimumScaleFactor(0.55)
                .lineLimit(1)
                .offset(y: showingSoundboard ? 12 : 36)

            Text(timer.isFinished ? "WORKOUT COMPLETE" : timer.roundText.uppercased())
                .font(fightFont(size: showingSoundboard ? 32 : 48, weight: .heavy))
                .tracking(0.4)
        }
        .shadow(color: .black.opacity(0.40), radius: 0, x: 1.5, y: 2.5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, showingSoundboard ? 8 : 110)
        .contentShape(Rectangle())
        .onTapGesture {
            guard !timer.isRunning else { return }
            showingTimeEditor = true
        }
        .accessibilityHint(timer.isRunning ? "Pause to edit the time" : "Tap to edit the current time")
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
            railButton(
                showingSoundboard ? "chevron.right" : "square.grid.2x2.fill",
                size: 26,
                label: showingSoundboard ? "Close soundboard" : "Open soundboard"
            ) {
                withAnimation(.easeInOut(duration: 0.22)) {
                    showingSoundboard.toggle()
                }
            }
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

private struct SoundboardPanel: View {
    @EnvironmentObject private var timer: WorkoutTimer

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("SOUNDBOARD")
                    .font(.subheadline.weight(.black))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .layoutPriority(1)
                Spacer()
            }

            Toggle(isOn: automaticTimerSoundsEnabled) {
                HStack(spacing: 6) {
                    Image(systemName: "timer")
                        .foregroundStyle(.white.opacity(0.72))
                    Text("TIMER CUES")
                        .font(.caption.weight(.black))
                    Spacer()
                    Text(timer.settings.automaticTimerSoundsEnabled ? "ON" : "OFF")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(.white.opacity(0.58))
                }
            }
            .toggleStyle(.switch)
            .tint(.green)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))

            LazyVGrid(columns: columns, spacing: 8) {
                SoundPadButton(title: "READY, SET", icon: "quote.bubble.fill", tint: .blue) {
                    timer.playManualReadySet()
                }
                SoundPadButton(title: "START WHISTLE", icon: "speaker.wave.3.fill", tint: .green) {
                    timer.playManualStartWhistle()
                }
                SoundPadButton(title: "THREE CLAPS", icon: "waveform", tint: .orange) {
                    timer.playManualClapper()
                }
                SoundPadButton(title: "SHORT WHISTLE", icon: "speaker.wave.2.fill", tint: .mint) {
                    timer.playManualShortWhistle()
                }
            }

            SoundPadButton(title: "FINAL HORN", icon: "flag.checkered", tint: .red) {
                timer.playManualFinalHorn()
            }

            VStack(spacing: 2) {
                HStack {
                    Text("SOUNDBOARD VOLUME")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(.white.opacity(0.72))
                    Spacer()
                    Text("\(Int((timer.settings.soundboardVolume * 100).rounded()))%")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(.white.opacity(0.68))
                }
                HStack(spacing: 8) {
                    Image(systemName: "speaker.fill")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.65))
                    Slider(value: soundboardVolume, in: 0...1, step: 0.05)
                        .tint(.white)
                        .accessibilityLabel("Soundboard volume")
                        .accessibilityValue("\(Int((timer.settings.soundboardVolume * 100).rounded())) percent")
                }
            }
            .padding(.horizontal, 4)
        }
        .padding(10)
        .foregroundStyle(.white)
        .background(.black.opacity(0.94), in: RoundedRectangle(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(.white.opacity(0.14), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.42), radius: 18, x: -4, y: 0)
        .onAppear { timer.prepareSoundboard() }
    }

    private var automaticTimerSoundsEnabled: Binding<Bool> {
        Binding(
            get: { timer.settings.automaticTimerSoundsEnabled },
            set: { timer.setAutomaticTimerSoundsEnabled($0) }
        )
    }

    private var soundboardVolume: Binding<Double> {
        Binding(
            get: { timer.settings.soundboardVolume },
            set: { timer.setSoundboardVolume($0) }
        )
    }

}

private struct SoundPadButton: View {
    let title: String
    let icon: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            action()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 24, weight: .bold))
                Text(title)
                    .font(.caption2.weight(.black))
                    .tracking(0.3)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(tint.opacity(0.72), in: RoundedRectangle(cornerRadius: 13))
            .overlay {
                RoundedRectangle(cornerRadius: 13)
                    .stroke(.white.opacity(0.18), lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 13))
        }
        .buttonStyle(SoundPadButtonStyle())
        .accessibilityLabel(title.capitalized)
    }
}

private struct SoundPadButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .brightness(configuration.isPressed ? 0.12 : 0)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.07), value: configuration.isPressed)
    }
}

private struct CurrentTimeEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedSeconds: Int
    let onApply: (Int) -> Void

    init(initialSeconds: Int, onApply: @escaping (Int) -> Void) {
        _selectedSeconds = State(initialValue: min(max(initialSeconds, 1), 3_599))
        self.onApply = onApply
    }

    var body: some View {
        NavigationStack {
            HStack(spacing: 8) {
                timeWheel(title: "MINUTES", values: 0...59, selection: minutes, twoDigits: false)

                Text(":")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .padding(.top, 18)

                timeWheel(title: "SECONDS", values: 0...59, selection: secondsPart, twoDigits: true)
            }
            .padding(.horizontal)
            .navigationTitle("Edit Current Time")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        onApply(max(1, selectedSeconds))
                        dismiss()
                    }
                    .fontWeight(.bold)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func timeWheel(
        title: String,
        values: ClosedRange<Int>,
        selection: Binding<Int>,
        twoDigits: Bool
    ) -> some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Picker(title, selection: selection) {
                ForEach(values, id: \.self) { value in
                    Text(twoDigits ? String(format: "%02d", value) : "\(value)")
                        .font(.title.monospacedDigit())
                        .tag(value)
                }
            }
            .pickerStyle(.wheel)
            .frame(width: 118, height: 160)
            .clipped()
        }
    }

    private var minutes: Binding<Int> {
        Binding(
            get: { selectedSeconds / 60 },
            set: { selectedSeconds = $0 * 60 + selectedSeconds % 60 }
        )
    }

    private var secondsPart: Binding<Int> {
        Binding(
            get: { selectedSeconds % 60 },
            set: { selectedSeconds = (selectedSeconds / 60) * 60 + $0 }
        )
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
                                tint: timer.color(for: .wrestle),
                                seconds: wrestleSeconds,
                                range: 1...3_600
                            )
                            DurationSelector(
                                title: "Rest",
                                tint: timer.color(for: .rest),
                                seconds: restSeconds,
                                range: 0...3_600
                            )
                            DurationSelector(
                                title: "Get Ready",
                                tint: timer.color(for: .ready),
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
                Section("Background Colors") {
                    ColorPicker("Get Ready", selection: readyColor, supportsOpacity: false)
                    ColorPicker("Wrestle", selection: wrestleColor, supportsOpacity: false)
                    ColorPicker("Rest", selection: restColor, supportsOpacity: false)
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
            }
            .navigationTitle("Workout Setup")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save & Apply") {
                        timer.reset()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .interactiveDismissDisabled()
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
    private var readyColor: Binding<Color> { Binding(get: { timer.settings.readyColor }, set: { timer.settings.readyColor = $0 }) }
    private var wrestleColor: Binding<Color> { Binding(get: { timer.settings.wrestleColor }, set: { timer.settings.wrestleColor = $0 }) }
    private var restColor: Binding<Color> { Binding(get: { timer.settings.restColor }, set: { timer.settings.restColor = $0 }) }
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
