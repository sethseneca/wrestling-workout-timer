import SwiftUI

enum WorkoutPhase: String {
    case ready = "GET READY"
    case wrestle = "WRESTLE"
    case rest = "REST"

    var colorName: String {
        switch self {
        case .ready: return "ready"
        case .wrestle: return "wrestle"
        case .rest: return "rest"
        }
    }
}

struct TimerSettings {
    var wrestleSeconds = 30
    var restSeconds = 15
    var readySeconds = 10
    var rounds = 8
    var whistleVolume = 1.5
    var wrestleLabel = "WRESTLE"
    var tenSecondWarningEnabled = true
    var tenSecondWarningVolume = 3.0
    var automaticTimerSoundsEnabled = true
    var soundboardVolume = 1.0
    var readyColor = Color(red: 0.41, green: 0.44, blue: 0.48)
    var wrestleColor = Color(red: 0.95, green: 0.23, blue: 0.25)
    var restColor = Color(red: 0.08, green: 0.58, blue: 0.30)
}

struct WorkoutSegment {
    let phase: WorkoutPhase
    let duration: TimeInterval
    let round: Int
    let start: TimeInterval
}

@MainActor
final class WorkoutTimer: ObservableObject {
    @Published var settings = TimerSettings()
    @Published private(set) var phase: WorkoutPhase = .ready
    @Published private(set) var remainingSeconds: Int = 10
    @Published private(set) var round = 1
    @Published private(set) var isRunning = false
    @Published private(set) var isFinished = false
    @Published private(set) var phaseProgress = 0.0

    private lazy var audio = AudioCueScheduler()
    private let liveActivity = WorkoutLiveActivityController()
    private var tickTimer: Timer?
    private var segments: [WorkoutSegment] = []
    private var startDate: Date?
    private var elapsedBeforeStart: TimeInterval = 0

    init() {
        if UserDefaults.standard.object(forKey: "automaticTimerSoundsEnabled") != nil {
            settings.automaticTimerSoundsEnabled = UserDefaults.standard.bool(forKey: "automaticTimerSoundsEnabled")
        }
        if UserDefaults.standard.object(forKey: "soundboardVolume") != nil {
            settings.soundboardVolume = min(
                max(UserDefaults.standard.double(forKey: "soundboardVolume"), 0),
                1
            )
        }
        reset(stopAudio: false)
        WorkoutTimerCommandCenter.register(
            toggle: { [weak self] in self?.startOrPause() },
            previousInterval: { [weak self] in self?.previousInterval() },
            nextInterval: { [weak self] in self?.nextInterval() },
            reset: { [weak self] in self?.reset() }
        )
#if WRESTLING_VERIFICATION
        if ProcessInfo.processInfo.environment["WRESTLING_DEVICE_VERIFY"] == "1" {
            startDeviceVerificationWorkout()
        }
#endif
    }

    deinit {
        tickTimer?.invalidate()
    }

    var countdownText: String {
        let minutes = remainingSeconds / 60
        let seconds = remainingSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    var phaseTitle: String {
        title(for: phase)
    }

    private func title(for phase: WorkoutPhase) -> String {
        guard phase == .wrestle else { return phase.rawValue }
        let label = settings.wrestleLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        return label.isEmpty ? WorkoutPhase.wrestle.rawValue : label.uppercased()
    }

    var roundText: String {
        "Round \(round) of \(settings.rounds)"
    }

    func color(for phase: WorkoutPhase) -> Color {
        switch phase {
        case .ready: return settings.readyColor
        case .wrestle: return settings.wrestleColor
        case .rest: return settings.restColor
        }
    }

    func startOrPause() {
        if isRunning {
            pause()
        } else {
            start()
        }
    }

    func start() {
        if isFinished {
            reset()
        }

        let pausedElapsed = elapsedBeforeStart
        let startingSegment = segments[currentSegmentIndex(at: pausedElapsed)]
        let startsAtSegmentBoundary = abs(pausedElapsed - startingSegment.start) < 0.001
        let immediateStartCue: CueKind? = startsAtSegmentBoundary
            ? cueForPhaseStart(startingSegment.phase)
            : nil
        startDate = Date()
        isRunning = true
        beginTicking()
        refresh()
        startLiveActivityPlan()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { [weak self] in
            guard let self, self.isRunning else { return }
            let audioElapsed = self.elapsed
            self.startTimerAudio(at: audioElapsed)
            if self.settings.automaticTimerSoundsEnabled, let immediateStartCue {
                self.audio.playTimerCueNow(
                    immediateStartCue,
                    volume: Float(self.settings.whistleVolume)
                )
            }
        }
    }

    func pause() {
        elapsedBeforeStart = elapsed
        startDate = nil
        isRunning = false
        tickTimer?.invalidate()
        tickTimer = nil
        refresh()
        syncLiveActivity()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { [weak self] in self?.audio.stopTimer() }
    }

    func reset(stopAudio: Bool = true) {
        startDate = nil
        elapsedBeforeStart = 0
        isRunning = false
        isFinished = false
        tickTimer?.invalidate()
        tickTimer = nil
        if stopAudio { audio.stopTimer() }
        liveActivity.end()
        segments = makeSegments()
        refresh()
    }

    func previousInterval() {
        let current = currentSegmentIndex()
        rebase(to: max(0, current - 1))
    }

    func nextInterval() {
        let current = currentSegmentIndex()
        let next = min(segments.count - 1, current + 1)
        guard next != current else { return }
        rebase(to: next)
    }

    func whistle() {
        audio.playNow(.whistle, volume: Float(settings.whistleVolume))
    }

    func warning() {
        audio.playNow(.clapper, volume: Float(settings.tenSecondWarningVolume))
    }

    func wheelClick() {
        audio.playNow(.wheelClick, volume: 0.65)
    }

    func prepareSoundboard() {
        audio.prepare()
    }

    func playManualShortWhistle() {
        audio.playNow(.whistle, volume: Float(settings.soundboardVolume))
    }

    func playManualFinalHorn() {
        audio.playNow(.airHorn, volume: Float(settings.soundboardVolume))
    }

    func playManualRoundOne() {
        audio.playNow(.roundOne, volume: Float(settings.soundboardVolume))
    }

    func playManualClapper() {
        audio.playNow(.clapper, volume: Float(settings.soundboardVolume))
    }

    func setAutomaticTimerSoundsEnabled(_ enabled: Bool) {
        settings.automaticTimerSoundsEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "automaticTimerSoundsEnabled")

        guard isRunning else {
            if !enabled { audio.stopTimer() }
            return
        }

        startTimerAudio(at: elapsed)
    }

    func setSoundboardVolume(_ volume: Double) {
        let clampedVolume = min(max(volume, 0), 1)
        settings.soundboardVolume = clampedVolume
        audio.setManualVolume(Float(clampedVolume))
        UserDefaults.standard.set(clampedVolume, forKey: "soundboardVolume")
    }

    func setCurrentRemainingSeconds(_ seconds: Int) {
        guard !isRunning, !segments.isEmpty else { return }
        let index = currentSegmentIndex()
        let segment = segments[index]
        let elapsedInSegment = max(0, elapsedBeforeStart - segment.start)
        let newDuration = elapsedInSegment + TimeInterval(min(max(seconds, 1), 3_599))
        let delta = newDuration - segment.duration

        segments[index] = WorkoutSegment(
            phase: segment.phase,
            duration: newDuration,
            round: segment.round,
            start: segment.start
        )
        if index + 1 < segments.count {
            for laterIndex in (index + 1)..<segments.count {
                let later = segments[laterIndex]
                segments[laterIndex] = WorkoutSegment(
                    phase: later.phase,
                    duration: later.duration,
                    round: later.round,
                    start: later.start + delta
                )
            }
        }
        refresh()
        if liveActivity.hasActiveActivity {
            syncLiveActivity()
        }
    }

    func setWhistleVolume(_ volume: Double) {
        settings.whistleVolume = volume
        audio.setVolumes(
            whistle: Float(settings.whistleVolume),
            warning: Float(settings.tenSecondWarningVolume)
        )
    }

    func setTenSecondWarningVolume(_ volume: Double) {
        settings.tenSecondWarningVolume = volume
        audio.setVolumes(
            whistle: Float(settings.whistleVolume),
            warning: Float(settings.tenSecondWarningVolume)
        )
    }

    func setTenSecondWarningEnabled(_ enabled: Bool) {
        settings.tenSecondWarningEnabled = enabled
        guard isRunning else { return }
        startTimerAudio(at: elapsed)
    }

#if WRESTLING_VERIFICATION
    func startDeviceVerificationWorkout() {
        settings.readySeconds = 3
        settings.wrestleSeconds = 6
        settings.restSeconds = 4
        settings.rounds = 8
        settings.tenSecondWarningEnabled = false
        settings.automaticTimerSoundsEnabled = true
        reset()
        NSLog("Device verification workout configured: ready=3 wrestle=6 rest=4 rounds=8")

        // Give ActivityKit time to dismiss any activity left by a prior run
        // before creating the isolated verification activity.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.start()
        }
    }
#endif

    func refresh(forceLiveActivitySync: Bool = false) {
        guard !segments.isEmpty else { return }
        let currentElapsed = elapsed
        let total = segments.last!.start + segments.last!.duration

        if currentElapsed >= total {
            let shouldEndLiveActivity = !isFinished
            audio.setBackgroundAudioDucked(false)
            remainingSeconds = 0
            phaseProgress = 1
            phase = .wrestle
            round = settings.rounds
            if isRunning {
                isRunning = false
                startDate = nil
                elapsedBeforeStart = total
                tickTimer?.invalidate()
                tickTimer = nil
            }
            isFinished = true
            if shouldEndLiveActivity {
                liveActivity.end()
            }
            return
        }

        isFinished = false
        let index = currentSegmentIndex(at: currentElapsed)
        let segment = segments[index]
        phase = segment.phase
        round = segment.round
        audio.setBackgroundAudioDucked(
            isRunning && settings.automaticTimerSoundsEnabled && phase == .rest
        )
        let remaining = max(0, segment.duration - (currentElapsed - segment.start))
        remainingSeconds = Int(ceil(remaining))
        phaseProgress = segment.duration > 0
            ? min(max((currentElapsed - segment.start) / segment.duration, 0), 1)
            : 1
        if isRunning, forceLiveActivitySync {
            syncLiveActivity(segmentIndex: index)
        }
    }

    private var elapsed: TimeInterval {
        elapsedBeforeStart + (startDate.map { Date().timeIntervalSince($0) } ?? 0)
    }

    private func beginTicking() {
        tickTimer?.invalidate()
        tickTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in self?.refresh() }
        }
        if let tickTimer { RunLoop.main.add(tickTimer, forMode: .common) }
    }

    private func rebase(to segmentIndex: Int) {
        guard segments.indices.contains(segmentIndex) else { return }
        elapsedBeforeStart = segments[segmentIndex].start
        startDate = nil
        isFinished = false
        if isRunning {
            start()
        } else {
            refresh()
            if liveActivity.hasActiveActivity {
                syncLiveActivity(segmentIndex: segmentIndex)
            }
        }
    }

    private func syncLiveActivity(segmentIndex: Int? = nil) {
        guard !segments.isEmpty, !isFinished else { return }
        let currentElapsed = elapsed
        let index = segmentIndex ?? currentSegmentIndex(at: currentElapsed)
        guard segments.indices.contains(index) else { return }

        let now = Date()
        let state = makeLiveActivityState(
            segmentIndex: index,
            workoutStart: now.addingTimeInterval(-currentElapsed),
            isRunning: isRunning
        )

        liveActivity.updateIfActive(state)
    }

    private func startLiveActivityPlan() {
        guard !segments.isEmpty, !isFinished else { return }
        let currentElapsed = elapsed
        let currentIndex = currentSegmentIndex(at: currentElapsed)
        let workoutStart = Date().addingTimeInterval(-currentElapsed)
        let states = segments.indices
            .filter { $0 >= currentIndex }
            .map {
                makeLiveActivityState(
                    segmentIndex: $0,
                    workoutStart: workoutStart,
                    isRunning: true
                )
            }
        liveActivity.startWorkout(with: states)
    }

    private func makeLiveActivityState(
        segmentIndex index: Int,
        workoutStart: Date,
        isRunning: Bool
    ) -> WorkoutActivityAttributes.ContentState {
        let segment = segments[index]
        let timerStart = workoutStart.addingTimeInterval(segment.start)
        let timerEnd = timerStart.addingTimeInterval(segment.duration)
        let now = Date()
        let remaining = isRunning
            ? min(segment.duration, max(0, timerEnd.timeIntervalSince(now)))
            : max(0, segment.duration - (elapsedBeforeStart - segment.start))
        return WorkoutActivityAttributes.ContentState(
            phase: title(for: segment.phase),
            round: segment.round,
            totalRounds: settings.rounds,
            timerStart: timerStart,
            timerEnd: timerEnd,
            remainingSeconds: Int(ceil(remaining)),
            isRunning: isRunning,
            canGoBack: index > 0,
            canAdvance: index < segments.count - 1,
            segmentIndex: index
        )
    }

    private func currentSegmentIndex(at elapsed: TimeInterval? = nil) -> Int {
        let value = elapsed ?? self.elapsed
        return segments.lastIndex(where: { $0.start <= value }) ?? 0
    }

    private func makeSegments() -> [WorkoutSegment] {
        var items: [WorkoutSegment] = []
        var offset: TimeInterval = 0
        let ready = max(0, settings.readySeconds)
        if ready > 0 {
            items.append(WorkoutSegment(phase: .ready, duration: TimeInterval(ready), round: 1, start: offset))
            offset += TimeInterval(ready)
        }

        for round in 1...max(1, settings.rounds) {
            let wrestle = TimeInterval(max(1, settings.wrestleSeconds))
            items.append(WorkoutSegment(phase: .wrestle, duration: wrestle, round: round, start: offset))
            offset += wrestle

            if round < settings.rounds, settings.restSeconds > 0 {
                let rest = TimeInterval(settings.restSeconds)
                items.append(WorkoutSegment(phase: .rest, duration: rest, round: round, start: offset))
                offset += rest
            }
        }
        return items
    }

    private func makeCues() -> [ScheduledCue] {
        var cues: [ScheduledCue] = []

        for segment in segments {
            if segment.phase == .wrestle {
                cues.append(ScheduledCue(kind: .whistle, offset: segment.start))
                cues.append(
                    ScheduledCue(
                        kind: .airHorn,
                        offset: segment.start + segment.duration
                    )
                )
                if settings.tenSecondWarningEnabled, segment.duration > 10 {
                    cues.append(
                        ScheduledCue(
                            kind: .clapper,
                            offset: segment.start + segment.duration - 10
                        )
                    )
                }
            }
        }
        return cues
    }

    private func makeTransitionOffsets() -> [TimeInterval] {
        segments.map { $0.start + $0.duration }
    }

    private func startTimerAudio(at audioElapsed: TimeInterval) {
        let startingSegmentIndex = currentSegmentIndex(at: audioElapsed)
        let startingPhase = segments[startingSegmentIndex].phase
        let segmentCount = segments.count
        let workoutStart = Date().addingTimeInterval(-audioElapsed)
        let workoutEnd = workoutStart.addingTimeInterval(
            segments.last.map { $0.start + $0.duration } ?? 0
        )
        let boundaryStates = segments.indices.map {
            makeLiveActivityState(
                segmentIndex: $0,
                workoutStart: workoutStart,
                isRunning: true
            )
        }
        audio.start(
            cues: settings.automaticTimerSoundsEnabled ? makeCues() : [],
            whistleVolume: Float(settings.whistleVolume),
            warningVolume: Float(settings.tenSecondWarningVolume),
            elapsed: audioElapsed,
            duckBackgroundAudio: settings.automaticTimerSoundsEnabled && startingPhase == .rest,
            transitionOffsets: makeTransitionOffsets()
        ) { [weak self] nextSegmentIndex in
            if boundaryStates.indices.contains(nextSegmentIndex) {
                WorkoutLiveActivityController.updateFromAudioBoundary(
                    boundaryStates[nextSegmentIndex]
                )
            } else if nextSegmentIndex >= segmentCount {
                WorkoutLiveActivityController.endFromAudioBoundary(at: workoutEnd)
            }

            Task { @MainActor [weak self] in
                guard let self, self.isRunning else { return }
                self.handleScheduledTransition(to: nextSegmentIndex)
            }
        }
    }

    private func handleScheduledTransition(to segmentIndex: Int) {
        guard isRunning else { return }

        let boundary = segments.indices.contains(segmentIndex)
            ? segments[segmentIndex].start
            : (segments.last.map { $0.start + $0.duration } ?? elapsed)
        let delay = max(0, boundary - elapsed + 0.02)
        guard delay <= 0.002 else {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.applyScheduledTransition(to: segmentIndex)
            }
            return
        }

        applyScheduledTransition(to: segmentIndex)
    }

    private func applyScheduledTransition(to segmentIndex: Int) {
        guard isRunning else { return }

        guard segments.indices.contains(segmentIndex) else {
            refresh()
            return
        }

        let segment = segments[segmentIndex]
        phase = segment.phase
        round = segment.round
        remainingSeconds = Int(ceil(segment.duration))
        phaseProgress = 0
        audio.setBackgroundAudioDucked(
            settings.automaticTimerSoundsEnabled && segment.phase == .rest
        )
    }

    private func cueForPhaseStart(_ phase: WorkoutPhase) -> CueKind? {
        switch phase {
        case .wrestle: return .whistle
        case .rest, .ready: return nil
        }
    }
}
