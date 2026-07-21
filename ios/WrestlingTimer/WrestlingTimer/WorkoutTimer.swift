import Foundation

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

    private let audio = AudioCueScheduler()
    private var tickTimer: Timer?
    private var segments: [WorkoutSegment] = []
    private var startDate: Date?
    private var elapsedBeforeStart: TimeInterval = 0

    init() {
        reset()
    }

    deinit {
        tickTimer?.invalidate()
    }

    var countdownText: String {
        let minutes = remainingSeconds / 60
        let seconds = remainingSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    var roundText: String {
        "Round \(round) of \(settings.rounds)"
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

        let elapsed = elapsedBeforeStart
        startDate = Date()
        isRunning = true
        audio.start(cues: makeCues(), volume: Float(settings.whistleVolume), elapsed: elapsed)
        beginTicking()
        refresh()
    }

    func pause() {
        elapsedBeforeStart = elapsed
        startDate = nil
        isRunning = false
        tickTimer?.invalidate()
        tickTimer = nil
        audio.stop()
        refresh()
    }

    func reset() {
        startDate = nil
        elapsedBeforeStart = 0
        isRunning = false
        isFinished = false
        tickTimer?.invalidate()
        tickTimer = nil
        audio.stop()
        segments = makeSegments()
        refresh()
    }

    func previousInterval() {
        let current = currentSegmentIndex()
        rebase(to: max(0, current - 1))
    }

    func nextInterval() {
        let current = currentSegmentIndex()
        rebase(to: min(segments.count - 1, current + 1))
    }

    func whistle() {
        audio.playNow(.whistle, volume: Float(settings.whistleVolume))
    }

    func refresh() {
        guard !segments.isEmpty else { return }
        let currentElapsed = elapsed
        let total = segments.last!.start + segments.last!.duration

        if currentElapsed >= total {
            remainingSeconds = 0
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
            return
        }

        isFinished = false
        let index = currentSegmentIndex(at: currentElapsed)
        let segment = segments[index]
        phase = segment.phase
        round = segment.round
        let remaining = max(0, segment.duration - (currentElapsed - segment.start))
        remainingSeconds = Int(ceil(remaining))
    }

    private var elapsed: TimeInterval {
        elapsedBeforeStart + (startDate.map { Date().timeIntervalSince($0) } ?? 0)
    }

    private func beginTicking() {
        tickTimer?.invalidate()
        tickTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.refresh()
        }
        if let tickTimer { RunLoop.main.add(tickTimer, forMode: .common) }
    }

    private func rebase(to segmentIndex: Int) {
        guard segments.indices.contains(segmentIndex) else { return }
        elapsedBeforeStart = segments[segmentIndex].start
        startDate = nil
        isFinished = false
        if isRunning { start() } else { refresh() }
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
        let total = segments.last.map { $0.start + $0.duration } ?? 0
        var cues: [ScheduledCue] = []

        for segment in segments {
            if segment.phase == .wrestle || segment.phase == .rest {
                cues.append(ScheduledCue(kind: .whistle, offset: segment.start))
            }
            if segment.phase == .wrestle, segment.duration > 10 {
                cues.append(ScheduledCue(kind: .clapper, offset: segment.start + segment.duration - 10))
            }
        }
        cues.append(ScheduledCue(kind: .whistle, offset: total))
        return cues
    }
}
