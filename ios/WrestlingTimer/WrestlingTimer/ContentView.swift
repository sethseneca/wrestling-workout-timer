import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showingSetup = false
    @State private var showingAudioMenu = false
    @State private var showingTimeEditor = false
    @State private var interfaceOrientation: UIInterfaceOrientation = .unknown

    private var orientationAnimation: Animation {
        reduceMotion
            ? .easeOut(duration: 0.10)
            : .spring(response: 0.36, dampingFraction: 0.88)
    }

    private var panelAnimation: Animation {
        reduceMotion ? .easeOut(duration: 0.10) : .easeOut(duration: 0.18)
    }

    var body: some View {
        GeometryReader { geometry in
            let layoutOrientation = TimerLayoutOrientation(
                interfaceOrientation: interfaceOrientation,
                availableSize: geometry.size
            )

            ZStack {
                timer.color(for: timer.phase)
                    .ignoresSafeArea()

                TimelineView(
                    .animation(minimumInterval: 1.0 / 60.0, paused: !timer.isRunning)
                ) { timeline in
                    VStack(spacing: 0) {
                        Color.black
                            .frame(
                                height: geometry.size.height
                                    * timer.renderedPhaseProgress(at: timeline.date)
                            )
                        Spacer(minLength: 0)
                    }
                }
                .ignoresSafeArea()

                timerReadout(for: layoutOrientation)
                    .padding(readoutInsets(for: layoutOrientation))
                    .animation(orientationAnimation, value: layoutOrientation)
                    .animation(panelAnimation, value: showingAudioMenu)

                audioButton
                    .frame(
                        maxWidth: .infinity,
                        maxHeight: .infinity,
                        alignment: layoutOrientation.audioButtonAlignment
                    )
                    .padding(audioButtonInsets(for: layoutOrientation))
                    .opacity(showingAudioMenu ? 0 : 1)
                    .allowsHitTesting(!showingAudioMenu)
                    .animation(orientationAnimation, value: layoutOrientation)

                controlRail(for: layoutOrientation)
                    .frame(
                        width: layoutOrientation.isPortrait ? max(0, geometry.size.width - 16) : 96,
                        height: layoutOrientation.isPortrait ? 88 : max(0, geometry.size.height - 16)
                    )
                    .frame(
                        maxWidth: .infinity,
                        maxHeight: .infinity,
                        alignment: layoutOrientation.controlAlignment
                    )
                    .padding(controlInsets(for: layoutOrientation))
                    .animation(orientationAnimation, value: layoutOrientation)

                if showingAudioMenu {
                    audioMenu(for: layoutOrientation, availableSize: geometry.size)
                        .transition(audioMenuTransition(for: layoutOrientation))
                }
            }
            .onAppear {
                ControlHaptics.shared.prepare(enabled: timer.settings.controlHapticsEnabled)
                refreshInterfaceOrientation()
            }
            .onReceive(NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)) { _ in
                refreshInterfaceOrientation(after: 0.03)
            }
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingSetup) {
            SetupView(initialSettings: timer.settings)
                .environmentObject(timer)
        }
        .sheet(isPresented: $showingTimeEditor) {
            CurrentTimeEditorView(initialSeconds: timer.remainingSeconds) { seconds in
                timer.setCurrentRemainingSeconds(seconds)
            }
        }
    }

    private func timerReadout(for orientation: TimerLayoutOrientation) -> some View {
        let phaseSize: CGFloat = orientation.isPortrait ? (showingAudioMenu ? 36 : 56) : (showingAudioMenu ? 34 : 48)
        let countdownSize: CGFloat = orientation.isPortrait ? (showingAudioMenu ? 112 : 188) : (showingAudioMenu ? 126 : 222)
        let roundSize: CGFloat = orientation.isPortrait ? (showingAudioMenu ? 28 : 42) : (showingAudioMenu ? 32 : 48)

        return VStack(spacing: 1) {
            Text(timer.phaseTitle)
                .font(fightFont(size: phaseSize))
                .tracking(0.5)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .offset(y: orientation.isPortrait ? 0 : (showingAudioMenu ? 8 : 22))

            Text(timer.countdownText)
                .font(fightFont(size: countdownSize))
                .monospacedDigit()
                .minimumScaleFactor(0.55)
                .lineLimit(1)
                .offset(y: orientation.isPortrait ? 0 : (showingAudioMenu ? 12 : 36))

            Text(timer.isFinished ? "WORKOUT COMPLETE" : timer.roundText.uppercased())
                .font(fightFont(size: roundSize, weight: .heavy))
                .tracking(0.4)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .shadow(color: .black.opacity(0.40), radius: 0, x: 1.5, y: 2.5)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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

    private var audioButton: some View {
        Button {
            ControlHaptics.shared.play(.light, enabled: timer.settings.controlHapticsEnabled)
            withAnimation(panelAnimation) {
                showingAudioMenu = true
            }
        } label: {
            ZStack {
                Circle()
                    .fill(.black.opacity(0.8))

                Image(systemName: "speaker.wave.3.fill")
                    .font(.system(size: 29, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
            }
            .frame(width: 60, height: 60)
            .contentShape(Circle())
        }
        .buttonStyle(PremiumControlButtonStyle(emphasis: .floating, reduceMotion: reduceMotion))
        .accessibilityLabel("Open sound and volume")
        .accessibilityIdentifier("Sound and volume button")
    }

    private func controlRail(for orientation: TimerLayoutOrientation) -> some View {
        let railLayout = orientation.isPortrait
            ? AnyLayout(HStackLayout(spacing: 0))
            : AnyLayout(VStackLayout(spacing: 0))

        return railLayout {
            HoldToResetControl(
                isEnabled: timer.canReset,
                hapticsEnabled: timer.settings.controlHapticsEnabled,
                action: { timer.reset() }
            )
            railButton(
                "backward.end.fill",
                label: "Previous interval",
                isEnabled: timer.canGoToPreviousInterval,
                feedback: .selection
            ) {
                timer.previousInterval()
            }
            Button {
                ControlHaptics.shared.play(
                    timer.isRunning ? .soft : .rigid,
                    enabled: timer.settings.controlHapticsEnabled
                )
                timer.startOrPause()
            } label: {
                ZStack {
                    Circle()
                        .fill(.white.opacity(timer.isRunning ? 0.18 : 0.14))
                        .overlay {
                            Circle()
                                .stroke(.white.opacity(0.12), lineWidth: 1)
                        }
                        .frame(width: 72, height: 72)
                    Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                        .font(.system(size: 38, weight: .bold))
                        .symbolRenderingMode(.monochrome)
                        .foregroundStyle(.white)
                        .contentTransition(reduceMotion ? .opacity : .symbolEffect(.replace))
                }
                .contentShape(Rectangle())
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(PremiumControlButtonStyle(emphasis: .primary, reduceMotion: reduceMotion))
            .animation(.easeOut(duration: reduceMotion ? 0.08 : 0.14), value: timer.isRunning)
            .accessibilityLabel(timer.isRunning ? "Pause timer" : "Start timer")
            railButton(
                "forward.end.fill",
                label: "Next interval",
                isEnabled: timer.canGoToNextInterval,
                feedback: .selection
            ) {
                timer.nextInterval()
            }
            railButton("gearshape.fill", size: 26, label: "Open workout setup", feedback: .light) {
                withAnimation(panelAnimation) {
                    showingAudioMenu = false
                }
                showingSetup = true
            }
        }
        .foregroundStyle(.white.opacity(0.82))
        .background {
            Capsule()
                .fill(.black.opacity(0.84))
                .overlay {
                    Capsule()
                        .stroke(
                            LinearGradient(
                                colors: [.white.opacity(0.20), .white.opacity(0.05)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
                .shadow(color: .black.opacity(0.30), radius: 12, x: 0, y: 5)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("Workout controls")
    }

    private func railButton(
        _ icon: String,
        size: CGFloat = 29,
        label: String,
        isEnabled: Bool = true,
        feedback: ControlFeedback,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            ControlHaptics.shared.play(feedback, enabled: timer.settings.controlHapticsEnabled)
            action()
        } label: {
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
        .buttonStyle(PremiumControlButtonStyle(emphasis: .secondary, reduceMotion: reduceMotion))
        .disabled(!isEnabled)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private func audioMenu(
        for orientation: TimerLayoutOrientation,
        availableSize: CGSize
    ) -> some View {
        AudioMenuPanel {
            withAnimation(panelAnimation) {
                showingAudioMenu = false
            }
        }
            .environmentObject(timer)
            .frame(width: orientation.isPortrait ? max(0, availableSize.width - 16) : 318)
            .frame(
                maxWidth: .infinity,
                maxHeight: .infinity,
                alignment: orientation.audioMenuAlignment
            )
            .padding(audioMenuInsets(for: orientation))
    }

    private func readoutInsets(for orientation: TimerLayoutOrientation) -> EdgeInsets {
        guard !orientation.isPortrait else {
            return EdgeInsets(
                top: 68,
                leading: 24,
                bottom: showingAudioMenu ? 390 : 104,
                trailing: 24
            )
        }

        if !showingAudioMenu {
            return EdgeInsets(top: 0, leading: 104, bottom: 0, trailing: 104)
        }

        switch orientation {
        case .portrait:
            return EdgeInsets()
        case .landscapeLeft:
            return EdgeInsets(top: 0, leading: 104, bottom: 0, trailing: 326)
        case .landscapeRight:
            return EdgeInsets(top: 0, leading: 326, bottom: 0, trailing: 104)
        }
    }

    private func audioButtonInsets(for orientation: TimerLayoutOrientation) -> EdgeInsets {
        switch orientation {
        case .portrait:
            return EdgeInsets(top: 8, leading: 0, bottom: 0, trailing: 8)
        case .landscapeLeft:
            return EdgeInsets(top: 0, leading: 0, bottom: 8, trailing: 4)
        case .landscapeRight:
            return EdgeInsets(top: 8, leading: 4, bottom: 0, trailing: 0)
        }
    }

    private func controlInsets(for orientation: TimerLayoutOrientation) -> EdgeInsets {
        switch orientation {
        case .portrait:
            return EdgeInsets(top: 0, leading: 8, bottom: 4, trailing: 8)
        case .landscapeLeft:
            return EdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 0)
        case .landscapeRight:
            return EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 4)
        }
    }

    private func audioMenuInsets(for orientation: TimerLayoutOrientation) -> EdgeInsets {
        switch orientation {
        case .portrait:
            return EdgeInsets(top: 8, leading: 8, bottom: 100, trailing: 8)
        case .landscapeLeft:
            return EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 4)
        case .landscapeRight:
            return EdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 0)
        }
    }

    private func refreshInterfaceOrientation(after delay: TimeInterval = 0) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard let orientation = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive })?
                .interfaceOrientation,
                orientation != .unknown
            else { return }

            withAnimation(orientationAnimation) {
                interfaceOrientation = orientation
            }
        }
    }

    private func audioMenuTransition(for orientation: TimerLayoutOrientation) -> AnyTransition {
        guard !reduceMotion else { return .opacity }
        return .move(edge: orientation.audioMenuTransitionEdge).combined(with: .opacity)
    }
}

private enum TimerLayoutOrientation: Equatable {
    case portrait
    case landscapeLeft
    case landscapeRight

    init(interfaceOrientation: UIInterfaceOrientation, availableSize: CGSize) {
        if availableSize.height >= availableSize.width {
            self = .portrait
            return
        }

        switch interfaceOrientation {
        case .landscapeLeft:
            self = .landscapeLeft
        case .landscapeRight:
            self = .landscapeRight
        default:
            self = .landscapeRight
        }
    }

    var isPortrait: Bool { self == .portrait }

    var controlAlignment: Alignment {
        switch self {
        case .portrait: .bottom
        case .landscapeLeft: .leading
        case .landscapeRight: .trailing
        }
    }

    var audioButtonAlignment: Alignment {
        switch self {
        case .portrait: .topTrailing
        case .landscapeLeft: .bottomTrailing
        case .landscapeRight: .topLeading
        }
    }

    var audioMenuAlignment: Alignment {
        switch self {
        case .portrait: .bottom
        case .landscapeLeft: .trailing
        case .landscapeRight: .leading
        }
    }

    var audioMenuTransitionEdge: Edge {
        switch self {
        case .portrait: .bottom
        case .landscapeLeft: .trailing
        case .landscapeRight: .leading
        }
    }
}

private struct AudioMenuPanel: View {
    @EnvironmentObject private var timer: WorkoutTimer
    let onClose: () -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    var body: some View {
        VStack(spacing: 7) {
            HStack(spacing: 8) {
                Image(systemName: "speaker.wave.3.fill")
                    .foregroundStyle(.white.opacity(0.72))
                Text("SOUND & VOLUME")
                    .font(.subheadline.weight(.black))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .layoutPriority(1)
                Spacer()
                Button {
                    ControlHaptics.shared.play(.light, enabled: timer.settings.controlHapticsEnabled)
                    onClose()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.black))
                        .frame(width: 30, height: 30)
                        .background(.white.opacity(0.12), in: Circle())
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close sound and volume")
            }

            HStack(spacing: 8) {
                compactSettingToggle(
                    title: "TIMER CUES",
                    icon: "timer",
                    isOn: automaticTimerSoundsEnabled,
                    accessibilityLabel: "Automatic timer cues"
                )
                compactSettingToggle(
                    title: "HAPTICS",
                    icon: "iphone.radiowaves.left.and.right",
                    isOn: controlHapticsEnabled,
                    accessibilityLabel: "Control haptics"
                )
            }

            audioVolumeRow(
                title: "WHISTLE",
                icon: "speaker.wave.2.fill",
                value: whistleVolume,
                range: 0...2,
                testLabel: "Test whistle",
                onTest: timer.whistle
            )

            warningVolumeRow

            LazyVGrid(columns: columns, spacing: 8) {
                SoundPadButton(title: "ROUND ONE", icon: "quote.bubble.fill", tint: .blue, hapticsEnabled: timer.settings.controlHapticsEnabled) {
                    timer.playManualRoundOne()
                }
                SoundPadButton(title: "THREE CLAPS", icon: "waveform", tint: .orange, hapticsEnabled: timer.settings.controlHapticsEnabled) {
                    timer.playManualClapper()
                }
                SoundPadButton(title: "SHORT WHISTLE", icon: "speaker.wave.2.fill", tint: .mint, hapticsEnabled: timer.settings.controlHapticsEnabled) {
                    timer.playManualShortWhistle()
                }
                SoundPadButton(title: "FINAL HORN", icon: "flag.checkered", tint: .red, hapticsEnabled: timer.settings.controlHapticsEnabled) {
                    timer.playManualFinalHorn()
                }
            }

            VStack(spacing: 2) {
                HStack {
                    Text("SOUND PADS")
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
                        .accessibilityLabel("Sound pads volume")
                        .accessibilityValue("\(Int((timer.settings.soundboardVolume * 100).rounded())) percent")
                }
            }
            .padding(.horizontal, 4)
        }
        .padding(10)
        .foregroundStyle(.white)
        .background(.black.opacity(0.98), in: RoundedRectangle(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(.white.opacity(0.14), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.42), radius: 18, x: -4, y: 0)
        .onAppear { timer.prepareSoundboard() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("Sound and volume menu")
    }

    private func compactSettingToggle(
        title: String,
        icon: String,
        isOn: Binding<Bool>,
        accessibilityLabel: String
    ) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.72))
            Text(title)
                .font(.caption2.weight(.black))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            Toggle("", isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
                .tint(.green)
                .scaleEffect(0.76)
                .frame(width: 42)
                .accessibilityLabel(accessibilityLabel)
        }
        .padding(.leading, 9)
        .padding(.trailing, 3)
        .frame(maxWidth: .infinity, minHeight: 42)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private func audioVolumeRow(
        title: String,
        icon: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        testLabel: String,
        isEnabled: Bool = true,
        onTest: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 8) {
            VStack(spacing: 2) {
                HStack(spacing: 7) {
                    Image(systemName: icon)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.68))
                    Text(title)
                        .font(.caption2.weight(.black))
                        .foregroundStyle(.white.opacity(0.76))
                    Spacer()
                    Text("\(Int((value.wrappedValue * 100).rounded()))%")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(.white.opacity(0.68))
                }
                Slider(value: value, in: range, step: 0.05)
                    .tint(.white)
                    .accessibilityLabel("\(title.capitalized) volume")
                    .accessibilityValue("\(Int((value.wrappedValue * 100).rounded())) percent")
            }
            Button("TEST", action: onTest)
                .font(.caption2.weight(.black))
                .buttonStyle(.bordered)
                .controlSize(.small)
                .frame(width: 58, height: 46)
                .contentShape(Rectangle())
                .accessibilityLabel(testLabel)
        }
        .padding(.horizontal, 4)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.45)
    }

    private var warningVolumeRow: some View {
        HStack(spacing: 8) {
            VStack(spacing: 2) {
                HStack(spacing: 7) {
                    Toggle(isOn: tenSecondWarningEnabled) {
                        HStack(spacing: 7) {
                            Image(systemName: "waveform")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.68))
                            Text("10-SECOND CLAPS")
                                .font(.caption2.weight(.black))
                                .foregroundStyle(.white.opacity(0.76))
                        }
                    }
                    .toggleStyle(.switch)
                    .tint(.green)
                    .scaleEffect(0.82, anchor: .trailing)
                    Spacer(minLength: 0)
                    Text("\(Int((timer.settings.tenSecondWarningVolume * 100).rounded()))%")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(.white.opacity(0.68))
                }
                Slider(value: warningVolume, in: 0...3, step: 0.05)
                    .tint(.white)
                    .accessibilityLabel("10-second claps volume")
                    .accessibilityValue("\(Int((timer.settings.tenSecondWarningVolume * 100).rounded())) percent")
                    .disabled(!timer.settings.tenSecondWarningEnabled)
                    .opacity(timer.settings.tenSecondWarningEnabled ? 1 : 0.45)
            }
            Button("TEST") { timer.warning() }
                .font(.caption2.weight(.black))
                .buttonStyle(.bordered)
                .controlSize(.small)
                .frame(width: 58, height: 46)
                .contentShape(Rectangle())
                .disabled(!timer.settings.tenSecondWarningEnabled)
                .accessibilityLabel("Test 10-second claps")
        }
        .padding(.horizontal, 4)
    }

    private var automaticTimerSoundsEnabled: Binding<Bool> {
        Binding(
            get: { timer.settings.automaticTimerSoundsEnabled },
            set: { timer.setAutomaticTimerSoundsEnabled($0) }
        )
    }

    private var controlHapticsEnabled: Binding<Bool> {
        Binding(
            get: { timer.settings.controlHapticsEnabled },
            set: {
                timer.setControlHapticsEnabled($0)
                ControlHaptics.shared.prepare(enabled: $0)
            }
        )
    }

    private var soundboardVolume: Binding<Double> {
        Binding(
            get: { timer.settings.soundboardVolume },
            set: { timer.setSoundboardVolume($0) }
        )
    }

    private var whistleVolume: Binding<Double> {
        Binding(
            get: { timer.settings.whistleVolume },
            set: { timer.setWhistleVolume($0) }
        )
    }

    private var warningVolume: Binding<Double> {
        Binding(
            get: { timer.settings.tenSecondWarningVolume },
            set: { timer.setTenSecondWarningVolume($0) }
        )
    }

    private var tenSecondWarningEnabled: Binding<Bool> {
        Binding(
            get: { timer.settings.tenSecondWarningEnabled },
            set: { timer.setTenSecondWarningEnabled($0) }
        )
    }

}

private struct SoundPadButton: View {
    let title: String
    let icon: String
    let tint: Color
    let hapticsEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button {
            ControlHaptics.shared.play(.medium, enabled: hapticsEnabled)
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
            .frame(maxWidth: .infinity, minHeight: 48)
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .brightness(configuration.isPressed ? 0.12 : 0)
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.96 : 1))
            .animation(
                reduceMotion
                    ? .easeOut(duration: 0.05)
                    : (configuration.isPressed
                        ? .easeOut(duration: 0.07)
                        : .spring(response: 0.14, dampingFraction: 0.78)),
                value: configuration.isPressed
            )
    }
}

private enum ControlFeedback {
    case light
    case medium
    case rigid
    case soft
    case selection
    case warning
}

private final class ControlHaptics {
    static let shared = ControlHaptics()

    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let selection = UISelectionFeedbackGenerator()
    private let warning = UINotificationFeedbackGenerator()

    private init() {}

    func prepare(enabled: Bool) {
        guard enabled else { return }
        light.prepare()
        medium.prepare()
        rigid.prepare()
        soft.prepare()
        selection.prepare()
        warning.prepare()
    }

    func play(_ feedback: ControlFeedback, enabled: Bool) {
        guard enabled else { return }

        switch feedback {
        case .light:
            light.impactOccurred(intensity: 0.72)
            light.prepare()
        case .medium:
            medium.impactOccurred(intensity: 0.82)
            medium.prepare()
        case .rigid:
            rigid.impactOccurred(intensity: 0.88)
            rigid.prepare()
        case .soft:
            soft.impactOccurred(intensity: 0.74)
            soft.prepare()
        case .selection:
            selection.selectionChanged()
            selection.prepare()
        case .warning:
            warning.notificationOccurred(.warning)
            warning.prepare()
        }
    }
}

private struct PremiumControlButtonStyle: ButtonStyle {
    enum Emphasis {
        case primary
        case secondary
        case floating
    }

    @Environment(\.isEnabled) private var isEnabled
    let emphasis: Emphasis
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                Circle()
                    .fill(.white.opacity(pressedSurfaceOpacity(configuration.isPressed)))
                    .frame(width: surfaceDiameter, height: surfaceDiameter)
                    .shadow(
                        color: .white.opacity(configuration.isPressed && isEnabled ? 0.10 : 0),
                        radius: 7
                    )
            }
            .brightness(configuration.isPressed && isEnabled ? 0.06 : 0)
            .opacity(isEnabled ? (configuration.isPressed ? 0.92 : 1) : 0.30)
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed && isEnabled ? pressedScale : 1))
            .animation(pressAnimation(isPressed: configuration.isPressed), value: configuration.isPressed)
            .animation(.easeOut(duration: 0.10), value: isEnabled)
    }

    private var surfaceDiameter: CGFloat {
        switch emphasis {
        case .primary: 72
        case .secondary: 54
        case .floating: 60
        }
    }

    private var pressedScale: CGFloat {
        emphasis == .primary ? 0.93 : 0.95
    }

    private func pressedSurfaceOpacity(_ isPressed: Bool) -> Double {
        guard isEnabled, isPressed else { return 0 }
        switch emphasis {
        case .primary: return 0.12
        case .secondary: return 0.17
        case .floating: return 0.10
        }
    }

    private func pressAnimation(isPressed: Bool) -> Animation {
        if reduceMotion { return .easeOut(duration: 0.05) }
        return isPressed
            ? .easeOut(duration: 0.07)
            : .spring(response: 0.14, dampingFraction: 0.78)
    }
}

private struct HoldToResetControl: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isPressing = false
    @State private var holdProgress: CGFloat = 0

    let isEnabled: Bool
    let hapticsEnabled: Bool
    let action: () -> Void

    private let holdDuration = 0.58

    var body: some View {
        Button(action: {}) {
            ZStack {
                Color.clear

                Circle()
                    .fill(.white.opacity(isPressing ? 0.14 : 0))
                    .frame(width: 54, height: 54)

                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 27, weight: .bold))
                    .symbolRenderingMode(.monochrome)
                    .frame(width: 46, height: 46)

                Circle()
                    .trim(from: 0, to: holdProgress)
                    .stroke(
                        Color.red.opacity(0.92),
                        style: StrokeStyle(lineWidth: 3, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .frame(width: 54, height: 54)
            }
            .contentShape(Rectangle())
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.30)
        .scaleEffect(reduceMotion ? 1 : (isPressing ? 0.95 : 1))
        .animation(
            reduceMotion
                ? .easeOut(duration: 0.05)
                : (isPressing
                    ? .easeOut(duration: 0.07)
                    : .spring(response: 0.14, dampingFraction: 0.78)),
            value: isPressing
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    guard hypot(value.translation.width, value.translation.height) <= 44 else {
                        cancelPress()
                        return
                    }
                    beginPressIfNeeded()
                }
                .onEnded(finishPress)
        )
        .disabled(!isEnabled)
        .accessibilityLabel("Reset")
        .accessibilityHint(isEnabled ? "Press and hold to reset the workout" : "The workout is already reset")
        .accessibilityAction {
            performReset()
        }
    }

    private func beginPressIfNeeded() {
        guard isEnabled else { return }
        guard !isPressing else { return }
        isPressing = true
        ControlHaptics.shared.prepare(enabled: hapticsEnabled)
        holdProgress = 0
        withAnimation(.linear(duration: holdDuration)) {
            holdProgress = 1
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + holdDuration) {
            guard isPressing else { return }
            performReset()
        }
    }

    private func finishPress(_: DragGesture.Value) {
        guard isPressing else { return }
        cancelPress()
    }

    private func cancelPress() {
        isPressing = false
        withAnimation(.easeOut(duration: 0.10)) {
            holdProgress = 0
        }
    }

    private func performReset() {
        guard isEnabled else { return }
        cancelPress()
        ControlHaptics.shared.play(.warning, enabled: hapticsEnabled)
        action()
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

private struct SetupView: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @Environment(\.dismiss) private var dismiss
    @State private var draft: TimerSettings

    init(initialSettings: TimerSettings) {
        var normalized = initialSettings
        normalized.wrestleSeconds = min(max(normalized.wrestleSeconds, 1), 3_600)
        normalized.restSeconds = min(max(normalized.restSeconds, 1), 3_600)
        normalized.readySeconds = min(max(normalized.readySeconds, 0), 120)
        normalized.rounds = min(max(normalized.rounds, 1), 99)
        _draft = State(initialValue: normalized)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("BUILD YOUR WORKOUT")
                            .font(.caption.weight(.black))
                            .tracking(1.2)
                            .foregroundStyle(.secondary)
                        Text("Tap one time for each phase.")
                            .font(.title3.weight(.bold))
                    }

                    PhaseDurationCard(
                        title: "Get Ready",
                        tint: draft.readyColor,
                        seconds: $draft.readySeconds,
                        presets: [
                            DurationPreset(seconds: 0, label: "NONE", accessibilityLabel: "None"),
                            DurationPreset(seconds: 5, label: "5 SEC", accessibilityLabel: "5 seconds"),
                            DurationPreset(seconds: 10, label: "10 SEC", accessibilityLabel: "10 seconds"),
                            DurationPreset(seconds: 15, label: "15 SEC", accessibilityLabel: "15 seconds"),
                            DurationPreset(seconds: 30, label: "30 SEC", accessibilityLabel: "30 seconds"),
                            DurationPreset(seconds: 60, label: "1 MIN", accessibilityLabel: "1 minute")
                        ],
                        customRange: 1...120,
                        customDefault: 10
                    )

                    PhaseDurationCard(
                        title: "Wrestle",
                        tint: draft.wrestleColor,
                        seconds: $draft.wrestleSeconds,
                        presets: [
                            DurationPreset(seconds: 15, label: "15 SEC", accessibilityLabel: "15 seconds"),
                            DurationPreset(seconds: 30, label: "30 SEC", accessibilityLabel: "30 seconds"),
                            DurationPreset(seconds: 60, label: "1 MIN", accessibilityLabel: "1 minute"),
                            DurationPreset(seconds: 120, label: "2 MIN", accessibilityLabel: "2 minutes"),
                            DurationPreset(seconds: 360, label: "6 MIN", accessibilityLabel: "6 minutes")
                        ],
                        customRange: 1...3_600,
                        customDefault: 30
                    )

                    PhaseDurationCard(
                        title: "Rest",
                        tint: draft.restColor,
                        seconds: $draft.restSeconds,
                        presets: [
                            DurationPreset(seconds: 5, label: "5 SEC", accessibilityLabel: "5 seconds"),
                            DurationPreset(seconds: 10, label: "10 SEC", accessibilityLabel: "10 seconds"),
                            DurationPreset(seconds: 20, label: "20 SEC", accessibilityLabel: "20 seconds"),
                            DurationPreset(seconds: 30, label: "30 SEC", accessibilityLabel: "30 seconds")
                        ],
                        customRange: 1...3_600,
                        customDefault: 15
                    )

                    RoundSelector(rounds: $draft.rounds)

                    DisplaySettingsCard(
                        wrestleLabel: $draft.wrestleLabel,
                        readyColor: $draft.readyColor,
                        wrestleColor: $draft.wrestleColor,
                        restColor: $draft.restColor
                    )
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("Workout Setup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .black))
                            .frame(width: 36, height: 36)
                    }
                    .accessibilityLabel("Discard workout changes")
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    timer.settings = draft
                    timer.reset()
                    dismiss()
                } label: {
                    Text("SAVE & APPLY")
                        .font(.headline.weight(.black))
                        .tracking(0.7)
                        .frame(maxWidth: .infinity, minHeight: 54)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(draft.wrestleColor, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(.white.opacity(0.22), lineWidth: 1)
                }
                .shadow(color: draft.wrestleColor.opacity(0.28), radius: 12, y: 5)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 8)
                .background(.ultraThinMaterial)
                .accessibilityLabel("Save & Apply")
            }
            .interactiveDismissDisabled()
        }
    }
}

private struct DurationPreset: Identifiable {
    let seconds: Int
    let label: String
    let accessibilityLabel: String

    var id: Int { seconds }
}

private struct TimeAdjustment: Identifiable {
    let delta: Int
    let label: String

    var id: Int { delta }
}

private struct PhaseDurationCard: View {
    @EnvironmentObject private var timer: WorkoutTimer
    let title: String
    let tint: Color
    @Binding var seconds: Int
    let presets: [DurationPreset]
    let customRange: ClosedRange<Int>
    let customDefault: Int
    @State private var customSelected: Bool

    private let columns = [
        GridItem(.flexible(), spacing: 9),
        GridItem(.flexible(), spacing: 9),
        GridItem(.flexible(), spacing: 9)
    ]
    private let adjustments = [
        TimeAdjustment(delta: -60, label: "−1m"),
        TimeAdjustment(delta: -5, label: "−5s"),
        TimeAdjustment(delta: 5, label: "+5s"),
        TimeAdjustment(delta: 60, label: "+1m")
    ]

    init(
        title: String,
        tint: Color,
        seconds: Binding<Int>,
        presets: [DurationPreset],
        customRange: ClosedRange<Int>,
        customDefault: Int
    ) {
        self.title = title
        self.tint = tint
        _seconds = seconds
        self.presets = presets
        self.customRange = customRange
        self.customDefault = customDefault
        _customSelected = State(
            initialValue: !presets.contains(where: { $0.seconds == seconds.wrappedValue })
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Circle()
                    .fill(tint)
                    .frame(width: 10, height: 10)
                Text(title.uppercased())
                    .font(.headline.weight(.black))
                    .tracking(0.8)

                Spacer()

                Text(seconds == 0 ? "OFF" : clockText(seconds))
                    .font(.subheadline.weight(.black))
                    .monospacedDigit()
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(tint.opacity(0.12), in: Capsule())
            }

            LazyVGrid(columns: columns, spacing: 9) {
                ForEach(presets) { preset in
                    presetButton(preset)
                }
                customButton
            }

            if customSelected {
                customEditor
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(Color.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(tint.opacity(0.24), lineWidth: 1)
        }
        .animation(.easeOut(duration: 0.16), value: customSelected)
    }

    private func presetButton(_ preset: DurationPreset) -> some View {
        let selected = !customSelected && seconds == preset.seconds

        return Button {
            ControlHaptics.shared.play(.selection, enabled: timer.settings.controlHapticsEnabled)
            customSelected = false
            seconds = preset.seconds
        } label: {
            HStack(spacing: 5) {
                Text(preset.label)
                    .font(.subheadline.weight(.black))
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption.weight(.black))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(selected ? Color.white : Color.primary.opacity(0.78))
            .background(
                selected ? tint.opacity(0.36) : Color.white.opacity(0.045),
                in: RoundedRectangle(cornerRadius: 13, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .stroke(selected ? tint : Color.white.opacity(0.09), lineWidth: selected ? 2 : 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title) \(preset.accessibilityLabel)")
        .accessibilityValue(selected ? "Selected" : "Not selected")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var customButton: some View {
        Button {
            ControlHaptics.shared.play(.selection, enabled: timer.settings.controlHapticsEnabled)
            if !customRange.contains(seconds) {
                seconds = min(max(customDefault, customRange.lowerBound), customRange.upperBound)
            }
            customSelected = true
        } label: {
            HStack(spacing: 5) {
                Text("CUSTOM")
                    .font(.subheadline.weight(.black))
                    .minimumScaleFactor(0.76)
                    .lineLimit(1)
                if customSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption.weight(.black))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(customSelected ? Color.white : Color.primary.opacity(0.78))
            .background(
                customSelected ? tint.opacity(0.36) : Color.white.opacity(0.045),
                in: RoundedRectangle(cornerRadius: 13, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .stroke(customSelected ? tint : Color.white.opacity(0.09), lineWidth: customSelected ? 2 : 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title) Custom")
        .accessibilityValue(customSelected ? "Selected" : "Not selected")
        .accessibilityAddTraits(customSelected ? .isSelected : [])
    }

    private var customEditor: some View {
        VStack(spacing: 10) {
            Text(clockText(seconds))
                .font(.system(size: 36, weight: .black, design: .rounded))
                .monospacedDigit()
                .frame(maxWidth: .infinity)
                .accessibilityLabel("\(title) custom time \(clockText(seconds))")

            HStack(spacing: 8) {
                ForEach(adjustments) { adjustment in
                    let enabled = clamped(seconds + adjustment.delta) != seconds
                    Button {
                        ControlHaptics.shared.play(.selection, enabled: timer.settings.controlHapticsEnabled)
                        seconds = clamped(seconds + adjustment.delta)
                    } label: {
                        Text(adjustment.label)
                            .font(.subheadline.weight(.black))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(enabled ? Color.primary : Color.secondary.opacity(0.45))
                    .background(Color.white.opacity(enabled ? 0.07 : 0.025), in: RoundedRectangle(cornerRadius: 11))
                    .disabled(!enabled)
                    .accessibilityLabel("\(title) custom \(adjustment.label)")
                }
            }
        }
        .padding(12)
        .background(Color.black.opacity(0.16), in: RoundedRectangle(cornerRadius: 15))
    }

    private func clamped(_ value: Int) -> Int {
        min(max(value, customRange.lowerBound), customRange.upperBound)
    }

    private func clockText(_ value: Int) -> String {
        String(format: "%d:%02d", value / 60, value % 60)
    }
}

private struct RoundSelector: View {
    @EnvironmentObject private var timer: WorkoutTimer
    @Binding var rounds: Int

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text("ROUNDS")
                    .font(.headline.weight(.black))
                    .tracking(0.8)
                Text("Total Wrestle periods")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            roundButton(icon: "minus", label: "Decrease rounds", enabled: rounds > 1) {
                rounds = max(1, rounds - 1)
            }

            Text("\(rounds)")
                .font(.system(size: 30, weight: .black, design: .rounded))
                .monospacedDigit()
                .frame(minWidth: 42)
                .accessibilityLabel("\(rounds) rounds")

            roundButton(icon: "plus", label: "Increase rounds", enabled: rounds < 99) {
                rounds = min(99, rounds + 1)
            }
        }
        .padding(16)
        .background(Color.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.09), lineWidth: 1)
        }
    }

    private func roundButton(
        icon: String,
        label: String,
        enabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            ControlHaptics.shared.play(.selection, enabled: timer.settings.controlHapticsEnabled)
            action()
        } label: {
            Image(systemName: icon)
                .font(.headline.weight(.black))
                .frame(width: 44, height: 44)
                .background(Color.white.opacity(enabled ? 0.08 : 0.03), in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.38)
        .accessibilityLabel(label)
    }
}

private struct DisplaySettingsCard: View {
    @Binding var wrestleLabel: String
    @Binding var readyColor: Color
    @Binding var wrestleColor: Color
    @Binding var restColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("DISPLAY")
                .font(.headline.weight(.black))
                .tracking(0.8)

            TextField("Wrestle label", text: $wrestleLabel)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .padding(.horizontal, 12)
                .frame(minHeight: 46)
                .background(Color.black.opacity(0.16), in: RoundedRectangle(cornerRadius: 12))

            Divider()

            ColorPicker("Get Ready color", selection: $readyColor, supportsOpacity: false)
            ColorPicker("Wrestle color", selection: $wrestleColor, supportsOpacity: false)
            ColorPicker("Rest color", selection: $restColor, supportsOpacity: false)
        }
        .padding(16)
        .background(Color.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Color.white.opacity(0.09), lineWidth: 1)
        }
    }
}
