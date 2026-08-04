import AVFoundation
import AudioToolbox
import Darwin

enum CueKind: Hashable {
    case whistle
    case airHorn
    case clapper
    case roundOne
    case wheelClick
}

struct ScheduledCue {
    let kind: CueKind
    let offset: TimeInterval
}

final class AudioCueScheduler {
    private let engine = AVAudioEngine()
    private let scheduledWhistleNode = AVAudioPlayerNode()
    private let scheduledWhistleGain = AVAudioUnitEQ(numberOfBands: 0)
    private let scheduledClapperNode = AVAudioPlayerNode()
    private let scheduledClapperGain = AVAudioUnitEQ(numberOfBands: 0)
    private let immediateTimerNode = AVAudioPlayerNode()
    private let immediateTimerGain = AVAudioUnitEQ(numberOfBands: 0)
    private let manualNodes = (0..<12).map { _ in AVAudioPlayerNode() }
    private let manualGains = (0..<12).map { _ in AVAudioUnitEQ(numberOfBands: 0) }
    private let keepAliveNode = AVAudioPlayerNode()
    private var buffers: [CueKind: AVAudioPCMBuffer] = [:]
    private var silentBuffer: AVAudioPCMBuffer?
    private var isPrepared = false
    private var isDuckingBackgroundAudio = false
    private var nextManualVoice = 0

    func prepare() {
        prepareIfNeeded()
    }

    func start(
        cues: [ScheduledCue],
        whistleVolume: Float,
        warningVolume: Float,
        elapsed: TimeInterval,
        duckBackgroundAudio: Bool
    ) {
        guard configureAudioSession(duckBackgroundAudio: duckBackgroundAudio) else { return }
        isDuckingBackgroundAudio = duckBackgroundAudio
        prepareIfNeeded()
        stopTimerNodes()
        setVolumes(whistle: whistleVolume, warning: warningVolume)
        guard activateEngine() else { return }

        if let silentBuffer {
            keepAliveNode.scheduleBuffer(silentBuffer, at: nil, options: [.loops])
            keepAliveNode.play()
        }

        let startHostTime = mach_absolute_time()
        for cue in cues where cue.offset > elapsed + 0.001 {
            let delay = max(0.08, cue.offset - elapsed)
            let scheduledTime = AVAudioTime(hostTime: startHostTime + AVAudioTime.hostTime(forSeconds: delay))
            scheduleTimerCue(cue.kind, at: scheduledTime)
        }
    }

    func playNow(_ kind: CueKind, volume: Float) {
        guard configureAudioSession(duckBackgroundAudio: isDuckingBackgroundAudio) else { return }
        prepareIfNeeded()
        guard activateEngine() else { return }

        guard let buffer = buffers[kind] else { return }
        let (node, gain) = nextManualNode()
        gain.globalGain = decibels(for: volume)
        node.stop()
        node.scheduleBuffer(buffer, at: nil, options: [])
        node.play()
    }

    func playTimerCueNow(_ kind: CueKind, volume: Float) {
        guard kind == .whistle || kind == .airHorn else { return }
        guard configureAudioSession(duckBackgroundAudio: isDuckingBackgroundAudio) else { return }
        prepareIfNeeded()
        guard activateEngine(), let buffer = buffers[kind] else { return }

        immediateTimerGain.globalGain = decibels(for: volume)
        immediateTimerNode.stop()
        immediateTimerNode.scheduleBuffer(buffer, at: nil, options: [])
        immediateTimerNode.play()
    }

    func setVolumes(whistle: Float, warning: Float) {
        scheduledWhistleGain.globalGain = decibels(for: whistle)
        scheduledClapperGain.globalGain = decibels(for: warning)
    }

    func setManualVolume(_ volume: Float) {
        let gain = decibels(for: volume)
        manualGains.forEach { $0.globalGain = gain }
    }

    func setBackgroundAudioDucked(_ shouldDuck: Bool) {
        guard shouldDuck != isDuckingBackgroundAudio else { return }
        guard configureAudioSession(duckBackgroundAudio: shouldDuck) else { return }
        isDuckingBackgroundAudio = shouldDuck
    }

    func stopTimer() {
        guard isPrepared else {
            isDuckingBackgroundAudio = false
            return
        }
        stopTimerNodes()
        setBackgroundAudioDucked(false)
    }

    func stopManualSounds() {
        guard isPrepared else { return }
        manualNodes.forEach { $0.stop() }
        nextManualVoice = 0
    }

    func stopAll() {
        guard isPrepared else {
            isDuckingBackgroundAudio = false
            return
        }
        stopTimerNodes()
        stopManualSounds()
        if engine.isRunning { engine.pause() }
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        isDuckingBackgroundAudio = false
    }

    private func configureAudioSession(duckBackgroundAudio: Bool) -> Bool {
        do {
            var options: AVAudioSession.CategoryOptions = [.mixWithOthers]
            if duckBackgroundAudio { options.insert(.duckOthers) }
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: options)
            return true
        } catch {
            return false
        }
    }

    private func activateEngine() -> Bool {
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            if !engine.isRunning { try engine.start() }
            return true
        } catch {
            return false
        }
    }

    private func prepareIfNeeded() {
        guard !isPrepared else { return }
        buffers[.whistle] = loadBuffer(named: "rest-horn")
        buffers[.airHorn] = loadBuffer(named: "air-horn")
        buffers[.clapper] = loadBuffer(named: "ten-second-clapper")
        buffers[.roundOne] = loadBuffer(named: "round-one")
        buffers[.wheelClick] = makeWheelClickBuffer()

        engine.attach(scheduledWhistleNode)
        engine.attach(scheduledWhistleGain)
        engine.attach(scheduledClapperNode)
        engine.attach(scheduledClapperGain)
        engine.attach(immediateTimerNode)
        engine.attach(immediateTimerGain)
        manualNodes.forEach(engine.attach)
        manualGains.forEach(engine.attach)
        engine.attach(keepAliveNode)

        let mixer = engine.mainMixerNode
        engine.connect(scheduledWhistleNode, to: scheduledWhistleGain, format: buffers[.whistle]?.format)
        engine.connect(scheduledWhistleGain, to: mixer, format: buffers[.whistle]?.format)
        engine.connect(scheduledClapperNode, to: scheduledClapperGain, format: buffers[.clapper]?.format)
        engine.connect(scheduledClapperGain, to: mixer, format: buffers[.clapper]?.format)
        engine.connect(immediateTimerNode, to: immediateTimerGain, format: buffers[.whistle]?.format)
        engine.connect(immediateTimerGain, to: mixer, format: buffers[.whistle]?.format)

        let manualFormat = buffers[.whistle]?.format
        for (node, gain) in zip(manualNodes, manualGains) {
            engine.connect(node, to: gain, format: manualFormat)
            engine.connect(gain, to: mixer, format: manualFormat)
        }

        let keepAliveFormat = mixer.outputFormat(forBus: 0)
        engine.connect(keepAliveNode, to: mixer, format: keepAliveFormat)
        silentBuffer = makeSilentBuffer(format: keepAliveFormat)
        isPrepared = true
    }

    private func nextManualNode() -> (AVAudioPlayerNode, AVAudioUnitEQ) {
        let voice = nextManualVoice
        nextManualVoice = (voice + 1) % manualNodes.count
        return (manualNodes[voice], manualGains[voice])
    }

    private func scheduleTimerCue(_ cue: CueKind, at time: AVAudioTime?) {
        switch cue {
        case .whistle, .airHorn:
            if let buffer = buffers[cue] {
                scheduledWhistleNode.scheduleBuffer(buffer, at: time, options: [])
                scheduledWhistleNode.play()
            }
        case .clapper:
            if let buffer = buffers[.clapper] {
                scheduledClapperNode.scheduleBuffer(buffer, at: time, options: [])
                scheduledClapperNode.play()
            }
        default:
            break
        }
    }

    private func stopTimerNodes() {
        scheduledWhistleNode.stop()
        scheduledClapperNode.stop()
        immediateTimerNode.stop()
        keepAliveNode.stop()
    }

    private func decibels(for linearVolume: Float) -> Float {
        guard linearVolume > 0 else { return -96 }
        return min(max(20 * log10f(linearVolume), -96), 24)
    }

    private func loadBuffer(named name: String) -> AVAudioPCMBuffer? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "m4a") else { return nil }
        do {
            let file = try AVAudioFile(forReading: url)
            guard let buffer = AVAudioPCMBuffer(
                pcmFormat: file.processingFormat,
                frameCapacity: AVAudioFrameCount(file.length)
            ) else { return nil }
            try file.read(into: buffer)
            return buffer
        } catch {
            return nil
        }
    }

    private func makeSilentBuffer(format: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard format.sampleRate > 0, format.channelCount > 0 else { return nil }
        let frameCount = AVAudioFrameCount(format.sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return nil }
        buffer.frameLength = frameCount
        return buffer
    }

    private func makeWheelClickBuffer() -> AVAudioPCMBuffer? {
        let sampleRate = 44_100.0
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else { return nil }
        let frameCount = AVAudioFrameCount(sampleRate * 0.018)
        guard
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
            let samples = buffer.floatChannelData?[0]
        else {
            return nil
        }

        buffer.frameLength = frameCount
        for frame in 0..<Int(frameCount) {
            let time = Double(frame) / sampleRate
            let envelope = exp(-time * 190)
            samples[frame] = Float(0.42 * envelope * sin(2 * Double.pi * 1_650 * time))
        }
        return buffer
    }

}
