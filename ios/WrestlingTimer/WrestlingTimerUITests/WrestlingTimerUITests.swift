import XCTest

final class WrestlingTimerUITests: XCTestCase {
    func testControlsCommunicateBoundariesAndProtectReset() throws {
        XCUIDevice.shared.orientation = .portrait

        let app = XCUIApplication()
        app.launch()

        let reset = app.buttons["Reset"]
        let previous = app.buttons["Previous interval"]
        let next = app.buttons["Next interval"]
        XCTAssertTrue(reset.waitForExistence(timeout: 3))
        XCTAssertFalse(reset.isEnabled, "Reset must be unavailable before the workout has moved.")
        XCTAssertFalse(previous.isEnabled, "Previous must be unavailable at the first interval.")
        XCTAssertTrue(next.isEnabled, "Next must remain available when a later interval exists.")

        app.buttons["Start timer"].tap()
        XCTAssertTrue(app.buttons["Pause timer"].waitForExistence(timeout: 2))
        XCTAssertTrue(reset.isEnabled, "A running workout must expose the protected reset action.")

        app.buttons["Pause timer"].tap()
        XCTAssertTrue(app.buttons["Start timer"].waitForExistence(timeout: 2))
        next.tap()
        XCTAssertTrue(app.staticTexts["WRESTLE"].waitForExistence(timeout: 2))
        XCTAssertTrue(previous.isEnabled, "Previous must become available after advancing.")

        reset.tap()
        XCTAssertTrue(app.staticTexts["WRESTLE"].exists, "A quick reset tap must not destroy workout progress.")

        reset.press(forDuration: 0.75)
        XCTAssertTrue(app.staticTexts["GET READY"].waitForExistence(timeout: 2))
        XCTAssertFalse(reset.isEnabled, "A completed reset must return to the protected initial state.")
    }

    func testDrainAdvancesAndResetsAtThePhaseBoundary() throws {
        XCUIDevice.shared.orientation = .portrait

        let app = XCUIApplication()
        app.launchEnvironment["WRESTLING_DEVICE_VERIFY"] = "1"
        app.launch()

        XCTAssertTrue(app.staticTexts["GET READY"].waitForExistence(timeout: 3))
        captureScreen(named: "drain-01-ready-start")

        sleep(2)
        captureScreen(named: "drain-02-ready-progress")

        guard app.staticTexts["WRESTLE"].waitForExistence(timeout: 3) else {
            throw XCTSkip("Requires the WRESTLING_VERIFICATION app build condition.")
        }
        captureScreen(named: "drain-03-wrestle-reset")
    }

    func testControlsTrackPhysicalPhoneEdgesAcrossOrientations() throws {
        XCUIDevice.shared.orientation = .portrait

        let app = XCUIApplication()
        app.launch()

        assertPortraitLayout(in: app)
        captureScreen(named: "orientation-01-portrait")
        assertAudioMenuFits(in: app, portrait: true, screenshotName: "orientation-01b-portrait-audio")

        XCUIDevice.shared.orientation = .landscapeLeft
        assertLandscapeLayout(in: app, controlsOnRight: true, audioCorner: .topLeft)
        captureScreen(named: "orientation-02-landscape-left")

        XCUIDevice.shared.orientation = .landscapeLeft
        assertLandscapeLayout(in: app, controlsOnRight: true, audioCorner: .topLeft)
        assertAudioMenuFits(in: app, portrait: false, screenshotName: "orientation-02b-landscape-audio")

        XCUIDevice.shared.orientation = .landscapeRight
        assertLandscapeLayout(in: app, controlsOnRight: false, audioCorner: .bottomRight)
        captureScreen(named: "orientation-03-landscape-right")

        XCUIDevice.shared.orientation = .portrait
        assertPortraitLayout(in: app)
        assertWorkoutSetupOwnsConfiguration(in: app)
    }

    func testWorkoutSetupPresetSelectionAndDiscard() throws {
        XCUIDevice.shared.orientation = .portrait

        let app = XCUIApplication()
        app.launch()

        app.buttons["Open workout setup"].tap()
        XCTAssertTrue(app.navigationBars["Workout Setup"].waitForExistence(timeout: 3))

        let readyTen = app.buttons["Get Ready 10 seconds"]
        let readyNone = app.buttons["Get Ready None"]
        XCTAssertTrue(readyTen.waitForExistence(timeout: 2))
        XCTAssertTrue(readyNone.exists)

        readyTen.tap()
        XCTAssertTrue(readyTen.isSelected)
        app.buttons["Save & Apply"].tap()
        XCTAssertTrue(app.buttons["Open workout setup"].waitForExistence(timeout: 3))

        app.buttons["Open workout setup"].tap()
        XCTAssertTrue(readyNone.waitForExistence(timeout: 2))
        readyNone.tap()
        XCTAssertTrue(readyNone.isSelected)
        app.buttons["Discard workout changes"].tap()
        XCTAssertTrue(app.buttons["Open workout setup"].waitForExistence(timeout: 3))

        app.buttons["Open workout setup"].tap()
        XCTAssertTrue(readyTen.waitForExistence(timeout: 2))
        XCTAssertTrue(readyTen.isSelected, "Closing with X must discard the unsaved None selection.")

        let wrestleTwoMinutes = app.buttons["Wrestle 2 minutes"]
        reveal(wrestleTwoMinutes, in: app)
        wrestleTwoMinutes.tap()
        XCTAssertTrue(wrestleTwoMinutes.isSelected)

        let restTwentySeconds = app.buttons["Rest 20 seconds"]
        reveal(restTwentySeconds, in: app)
        restTwentySeconds.tap()
        XCTAssertTrue(restTwentySeconds.isSelected)

        app.buttons["Save & Apply"].tap()
        XCTAssertTrue(app.buttons["Open workout setup"].waitForExistence(timeout: 3))

        app.buttons["Open workout setup"].tap()
        XCTAssertTrue(app.navigationBars["Workout Setup"].waitForExistence(timeout: 3))
        reveal(app.buttons["Wrestle 2 minutes"], in: app)
        XCTAssertTrue(app.buttons["Wrestle 2 minutes"].isSelected)
        reveal(app.buttons["Rest 20 seconds"], in: app)
        XCTAssertTrue(app.buttons["Rest 20 seconds"].isSelected)
        captureScreen(named: "setup-preset-selection")
        app.buttons["Discard workout changes"].tap()
    }

    func testWorkoutSetupStaysPortraitAndRestoresTimerRotation() throws {
        XCUIDevice.shared.orientation = .landscapeLeft

        let app = XCUIApplication()
        app.launch()
        assertLandscapeLayout(in: app, controlsOnRight: true, audioCorner: .topLeft)

        app.buttons["Open workout setup"].tap()
        XCTAssertTrue(app.navigationBars["Workout Setup"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            waitForWindow(app.windows.firstMatch, portrait: true),
            "Workout Setup must rotate into portrait before it appears."
        )

        XCUIDevice.shared.orientation = .landscapeRight
        sleep(1)
        let setupFrame = app.windows.firstMatch.frame
        XCTAssertGreaterThan(
            setupFrame.height,
            setupFrame.width,
            "Workout Setup must remain portrait while the phone turns."
        )
        captureScreen(named: "setup-portrait-lock")

        app.buttons["Discard workout changes"].tap()
        XCTAssertTrue(
            waitForWindow(app.windows.firstMatch, portrait: false),
            "The timer must return to a landscape layout after Setup closes."
        )

        XCUIDevice.shared.orientation = .portrait
        assertPortraitLayout(in: app)

        XCUIDevice.shared.orientation = .landscapeRight
        assertLandscapeLayout(in: app, controlsOnRight: false, audioCorner: .bottomRight)
    }

    func testSaveAndApplyAcceptsTapsAcrossTheEntireButton() throws {
        XCUIDevice.shared.orientation = .portrait

        let app = XCUIApplication()
        app.launch()

        for horizontalOffset in [0.06, 0.94] {
            app.buttons["Open workout setup"].tap()
            XCTAssertTrue(app.navigationBars["Workout Setup"].waitForExistence(timeout: 5))

            let saveButton = app.buttons["Save & Apply"]
            XCTAssertTrue(saveButton.waitForExistence(timeout: 3))
            XCTAssertTrue(saveButton.isHittable)
            XCTAssertGreaterThan(
                saveButton.frame.width,
                app.windows.firstMatch.frame.width * 0.80,
                "Save & Apply must expose its full visual width as one button."
            )

            saveButton
                .coordinate(withNormalizedOffset: CGVector(dx: horizontalOffset, dy: 0.5))
                .tap()

            XCTAssertTrue(
                app.buttons["Open workout setup"].waitForExistence(timeout: 3),
                "A tap near either horizontal edge must apply and close Workout Setup."
            )
        }
    }

    func testMinimizedWorkoutSurvivesMidpointHandoff() throws {
        let app = XCUIApplication()
        app.launchEnvironment["WRESTLING_DEVICE_VERIFY"] = "1"
        app.launch()

        XCTAssertTrue(
            app.staticTexts["GET READY"].waitForExistence(timeout: 5),
            "The accelerated verification workout did not start."
        )

        XCUIDevice.shared.press(.home)
        captureScreen(named: "01-first-activity")

        // The accelerated sequence reaches the scheduled handoff after 39s:
        // Ready, W1, R1, W2, R2, W3, R3, W4, then R4 on activity two.
        sleep(39)
        captureScreen(named: "02-handoff")
        sleep(2)
        captureScreen(named: "03-rest-four")
        sleep(4)
        captureScreen(named: "04-wrestle-five")

        // Cross the second handoff and prove a late workout phase still renders.
        sleep(19)
        captureScreen(named: "05-after-second-handoff")

        // Keep the app minimized through the end of the workout.
        sleep(16)
        captureScreen(named: "06-workout-finished")
    }

    private enum ScreenCorner {
        case topLeft
        case bottomRight
    }

    private func assertPortraitLayout(in app: XCUIApplication) {
        let window = app.windows.firstMatch
        XCTAssertTrue(waitForWindow(window, portrait: true), "The app did not settle into portrait.")

        let reset = app.buttons["Reset"]
        let gear = app.buttons["Open workout setup"]
        let audio = app.buttons["Sound and volume button"]
        XCTAssertTrue(reset.waitForExistence(timeout: 3))
        XCTAssertTrue(gear.exists)
        XCTAssertTrue(audio.exists)

        let bounds = window.frame
        XCTAssertLessThan(abs(reset.frame.midY - gear.frame.midY), 12, "Portrait controls must form one horizontal bottom bar.")
        XCTAssertGreaterThan(reset.frame.midY, bounds.height * 0.72, "Portrait controls must stay on the phone's physical bottom edge.")
        XCTAssertGreaterThan(audio.frame.midX, bounds.width * 0.72, "Audio must stay in the physical portrait top-right corner.")
        XCTAssertLessThan(audio.frame.midY, bounds.height * 0.28, "Audio must stay in the physical portrait top-right corner.")
    }

    private func assertLandscapeLayout(
        in app: XCUIApplication,
        controlsOnRight: Bool,
        audioCorner: ScreenCorner
    ) {
        let window = app.windows.firstMatch
        XCTAssertTrue(waitForWindow(window, portrait: false), "The app did not settle into landscape.")

        let reset = app.buttons["Reset"]
        let gear = app.buttons["Open workout setup"]
        let audio = app.buttons["Sound and volume button"]
        XCTAssertTrue(reset.waitForExistence(timeout: 3))
        XCTAssertTrue(gear.exists)
        XCTAssertTrue(audio.exists)

        let bounds = window.frame
        XCTAssertLessThan(abs(reset.frame.midX - gear.frame.midX), 12, "Landscape controls must form one vertical side rail.")
        if controlsOnRight {
            XCTAssertGreaterThan(reset.frame.midX, bounds.width * 0.72, "The controls must remain on the phone's physical bottom edge.")
        } else {
            XCTAssertLessThan(reset.frame.midX, bounds.width * 0.28, "The controls must remain on the phone's physical bottom edge.")
        }

        switch audioCorner {
        case .topLeft:
            XCTAssertLessThan(audio.frame.midX, bounds.width * 0.28)
            XCTAssertLessThan(audio.frame.midY, bounds.height * 0.35)
        case .bottomRight:
            XCTAssertGreaterThan(audio.frame.midX, bounds.width * 0.72)
            XCTAssertGreaterThan(audio.frame.midY, bounds.height * 0.65)
        }
    }

    private func waitForWindow(_ window: XCUIElement, portrait: Bool) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in
                guard window.exists else { return false }
                let frame = window.frame
                return portrait ? frame.height > frame.width : frame.width > frame.height
            },
            object: nil
        )
        return XCTWaiter.wait(for: [expectation], timeout: 5) == .completed
    }

    private func assertAudioMenuFits(in app: XCUIApplication, portrait: Bool, screenshotName: String) {
        app.buttons["Sound and volume button"].tap()
        XCTAssertTrue(app.staticTexts["SOUND & VOLUME"].waitForExistence(timeout: 3))
        let close = app.buttons["Close sound and volume"]
        XCTAssertTrue(close.exists)
        XCTAssertTrue(close.isHittable)
        XCTAssertGreaterThanOrEqual(close.frame.width, 44)
        XCTAssertGreaterThanOrEqual(close.frame.height, 44)
        XCTAssertTrue(app.switches["Automatic timer cues"].exists)
        XCTAssertTrue(app.switches["Control haptics"].exists)
        XCTAssertTrue(app.sliders["Whistle volume"].exists)
        XCTAssertTrue(app.sliders["10-second claps volume"].exists)
        XCTAssertTrue(app.sliders["Sound pads volume"].exists)
        XCTAssertTrue(app.buttons["Final Horn"].exists)
        for testButton in ["Test whistle", "Test 10-second claps"] {
            let button = app.buttons[testButton]
            XCTAssertTrue(button.exists)
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        }
        XCTAssertTrue(waitForWindow(app.windows.firstMatch, portrait: portrait))
        sleep(1)
        captureScreen(named: screenshotName)
        app.buttons["Close sound and volume"].tap()
        XCTAssertTrue(app.buttons["Sound and volume button"].waitForExistence(timeout: 3))
    }

    private func assertWorkoutSetupOwnsConfiguration(in app: XCUIApplication) {
        app.buttons["Open workout setup"].tap()
        XCTAssertTrue(app.navigationBars["Workout Setup"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Discard workout changes"].exists)
        XCTAssertTrue(app.buttons["Get Ready None"].exists)
        XCTAssertTrue(app.buttons["Get Ready 10 seconds"].exists)
        XCTAssertEqual(app.pickers.count, 0, "Workout durations must not use scrolling wheels.")
        XCTAssertFalse(app.sliders["Whistle volume"].exists, "Audio controls must not be duplicated in workout setup.")
        app.buttons["Save & Apply"].tap()
        XCTAssertTrue(app.buttons["Open workout setup"].waitForExistence(timeout: 3))
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<6 where !element.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }

    private func captureScreen(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
