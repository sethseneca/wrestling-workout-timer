import AVFoundation
import AudioToolbox
import Darwin

enum CueKind {
    case whistle
    case clapper
    case wheelClick
}

struct ScheduledCue {
    let kind: CueKind
    let offset: TimeInterval
}

final class AudioCueScheduler {
    private let engine = AVAudioEngine()
    private let whistleNode = AVAudioPlayerNode()
    private let whistleGain = AVAudioUnitEQ(numberOfBands: 0)
    private let immediateWhistleNode = AVAudioPlayerNode()
    private let immediateWhistleGain = AVAudioUnitEQ(numberOfBands: 0)
    private let clapperNode = AVAudioPlayerNode()
    private let clapperBoost = AVAudioUnitEQ(numberOfBands: 0)
    private let wheelClickNode = AVAudioPlayerNode()
    private let wheelClickGain = AVAudioUnitEQ(numberOfBands: 0)
    private let keepAliveNode = AVAudioPlayerNode()
    private var whistleBuffer: AVAudioPCMBuffer?
    private var clapperBuffer: AVAudioPCMBuffer?
    private var wheelClickBuffer: AVAudioPCMBuffer?
    private var silentBuffer: AVAudioPCMBuffer?
    private var isPrepared = false
    private var isDuckingBackgroundAudio = false

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
        stopNodes()
        setVolumes(whistle: whistleVolume, warning: warningVolume)

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(true)
            if !engine.isRunning { try engine.start() }
        } catch {
            return
        }

        if let silentBuffer {
            keepAliveNode.scheduleBuffer(silentBuffer, at: nil, options: [.loops])
            keepAliveNode.play()
        }

        let startHostTime = mach_absolute_time()
        for cue in cues where cue.offset >= elapsed {
            let delay = max(0.08, cue.offset - elapsed)
            let scheduledTime = AVAudioTime(hostTime: startHostTime + AVAudioTime.hostTime(forSeconds: delay))
            schedule(cue: cue.kind, at: scheduledTime)
        }
    }

    func playNow(_ kind: CueKind, volume: Float) {
        guard configureAudioSession(duckBackgroundAudio: isDuckingBackgroundAudio) else { return }
        prepareIfNeeded()
        switch kind {
        case .whistle: immediateWhistleGain.globalGain = decibels(for: volume)
        case .clapper: clapperBoost.globalGain = decibels(for: volume)
        case .wheelClick: wheelClickGain.globalGain = decibels(for: volume)
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(true)
            if !engine.isRunning { try engine.start() }
        } catch {
            return
        }
        switch kind {
        case .whistle:
            if let whistleBuffer {
                immediateWhistleNode.scheduleBuffer(whistleBuffer, at: nil, options: [])
                immediateWhistleNode.play()
            }
        case .clapper:
            schedule(cue: kind, at: nil)
        case .wheelClick:
            if let wheelClickBuffer {
                wheelClickNode.stop()
                wheelClickNode.scheduleBuffer(wheelClickBuffer, at: nil, options: [])
                wheelClickNode.play()
            }
        }
    }

    func setVolumes(whistle: Float, warning: Float) {
        whistleGain.globalGain = decibels(for: whistle)
        immediateWhistleGain.globalGain = decibels(for: whistle)
        clapperBoost.globalGain = decibels(for: warning)
    }

    func setBackgroundAudioDucked(_ shouldDuck: Bool) {
        guard shouldDuck != isDuckingBackgroundAudio else { return }
        guard configureAudioSession(duckBackgroundAudio: shouldDuck) else { return }
        isDuckingBackgroundAudio = shouldDuck
    }

    func stop() {
        guard isPrepared else {
            isDuckingBackgroundAudio = false
            return
        }
        stopNodes()
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

    private func prepareIfNeeded() {
        guard !isPrepared else { return }
        whistleBuffer = loadBuffer(named: "rest-horn")
        clapperBuffer = loadBuffer(named: "ten-second-clapper")
        wheelClickBuffer = makeWheelClickBuffer()

        engine.attach(whistleNode)
        engine.attach(whistleGain)
        engine.attach(immediateWhistleNode)
        engine.attach(immediateWhistleGain)
        engine.attach(clapperNode)
        engine.attach(clapperBoost)
        engine.attach(wheelClickNode)
        engine.attach(wheelClickGain)
        engine.attach(keepAliveNode)
        let mixer = engine.mainMixerNode
        engine.connect(whistleNode, to: whistleGain, format: whistleBuffer?.format)
        engine.connect(whistleGain, to: mixer, format: whistleBuffer?.format)
        engine.connect(immediateWhistleNode, to: immediateWhistleGain, format: whistleBuffer?.format)
        engine.connect(immediateWhistleGain, to: mixer, format: whistleBuffer?.format)
        engine.connect(clapperNode, to: clapperBoost, format: clapperBuffer?.format)
        engine.connect(clapperBoost, to: mixer, format: clapperBuffer?.format)
        engine.connect(wheelClickNode, to: wheelClickGain, format: wheelClickBuffer?.format)
        engine.connect(wheelClickGain, to: mixer, format: wheelClickBuffer?.format)

        let keepAliveFormat = mixer.outputFormat(forBus: 0)
        engine.connect(keepAliveNode, to: mixer, format: keepAliveFormat)
        silentBuffer = makeSilentBuffer(format: keepAliveFormat)
        isPrepared = true
    }

    private func decibels(for linearVolume: Float) -> Float {
        guard linearVolume > 0 else { return -96 }
        return min(max(20 * log10f(linearVolume), -96), 24)
    }

    private func schedule(cue: CueKind, at time: AVAudioTime?) {
        switch cue {
        case .whistle:
            if let whistleBuffer {
                whistleNode.scheduleBuffer(whistleBuffer, at: time, options: [])
                whistleNode.play()
            }
        case .clapper:
            if let clapperBuffer {
                clapperNode.scheduleBuffer(clapperBuffer, at: time, options: [])
                clapperNode.play()
            }
        case .wheelClick:
            if let wheelClickBuffer {
                wheelClickNode.scheduleBuffer(wheelClickBuffer, at: time, options: [])
                wheelClickNode.play()
            }
        }
    }

    private func stopNodes() {
        whistleNode.stop()
        immediateWhistleNode.stop()
        clapperNode.stop()
        wheelClickNode.stop()
        keepAliveNode.stop()
    }

    private func loadBuffer(named name: String) -> AVAudioPCMBuffer? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "m4a") else { return nil }
        do {
            let file = try AVAudioFile(forReading: url)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)) else { return nil }
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
