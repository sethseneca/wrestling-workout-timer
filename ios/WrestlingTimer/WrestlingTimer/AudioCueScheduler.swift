import AVFoundation
import AudioToolbox
import Darwin

enum CueKind {
    case whistle
    case clapper
}

struct ScheduledCue {
    let kind: CueKind
    let offset: TimeInterval
}

final class AudioCueScheduler {
    private let engine = AVAudioEngine()
    private let whistleNode = AVAudioPlayerNode()
    private let clapperNode = AVAudioPlayerNode()
    private let keepAliveNode = AVAudioPlayerNode()
    private var whistleBuffer: AVAudioPCMBuffer?
    private var clapperBuffer: AVAudioPCMBuffer?
    private var silentBuffer: AVAudioPCMBuffer?
    private var isPrepared = false

    func start(cues: [ScheduledCue], volume: Float, elapsed: TimeInterval) {
        guard configureAudioSession() else { return }
        prepareIfNeeded()
        stopNodes()
        whistleNode.volume = min(max(volume, 0.25), 2)
        clapperNode.volume = 1

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
        guard configureAudioSession() else { return }
        prepareIfNeeded()
        whistleNode.volume = min(max(volume, 0.25), 2)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(true)
            if !engine.isRunning { try engine.start() }
        } catch {
            return
        }
        schedule(cue: kind, at: nil)
    }

    func stop() {
        stopNodes()
        engine.pause()
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    private func configureAudioSession() -> Bool {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            return true
        } catch {
            return false
        }
    }

    private func prepareIfNeeded() {
        guard !isPrepared else { return }
        whistleBuffer = loadBuffer(named: "rest-horn")
        clapperBuffer = loadBuffer(named: "ten-second-clapper")

        engine.attach(whistleNode)
        engine.attach(clapperNode)
        engine.attach(keepAliveNode)
        let mixer = engine.mainMixerNode
        engine.connect(whistleNode, to: mixer, format: whistleBuffer?.format)
        engine.connect(clapperNode, to: mixer, format: clapperBuffer?.format)

        let keepAliveFormat = mixer.outputFormat(forBus: 0)
        engine.connect(keepAliveNode, to: mixer, format: keepAliveFormat)
        silentBuffer = makeSilentBuffer(format: keepAliveFormat)
        isPrepared = true
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
        }
    }

    private func stopNodes() {
        whistleNode.stop()
        clapperNode.stop()
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
}
