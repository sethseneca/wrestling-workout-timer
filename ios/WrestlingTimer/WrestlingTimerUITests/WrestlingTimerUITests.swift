import XCTest

final class WrestlingTimerUITests: XCTestCase {
    func testControlsTrackPhysicalPhoneEdgesAcrossOrientations() throws {
        XCUIDevice.shared.orientation = .portrait

        let app = XCUIApplication()
        app.launch()

        assertPortraitLayout(in: app)
        captureScreen(named: "orientation-01-portrait")
        assertSoundboardFits(in: app, portrait: true, screenshotName: "orientation-01b-portrait-soundboard")

        XCUIDevice.shared.orientation = .landscapeLeft
        assertLandscapeLayout(in: app, controlsOnRight: true, gearCorner: .topLeft)
        captureScreen(named: "orientation-02-landscape-left")

        XCUIDevice.shared.orientation = .landscapeLeft
        assertLandscapeLayout(in: app, controlsOnRight: true, gearCorner: .topLeft)
        assertSoundboardFits(in: app, portrait: false, screenshotName: "orientation-02b-landscape-soundboard")

        XCUIDevice.shared.orientation = .landscapeRight
        assertLandscapeLayout(in: app, controlsOnRight: false, gearCorner: .bottomRight)
        captureScreen(named: "orientation-03-landscape-right")

        XCUIDevice.shared.orientation = .portrait
        assertPortraitLayout(in: app)
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
        let soundboard = app.buttons["Open soundboard"]
        let gear = app.buttons["Workout setup button"]
        XCTAssertTrue(reset.waitForExistence(timeout: 3))
        XCTAssertTrue(soundboard.exists)
        XCTAssertTrue(gear.exists)

        let bounds = window.frame
        XCTAssertLessThan(abs(reset.frame.midY - soundboard.frame.midY), 12, "Portrait controls must form one horizontal bottom bar.")
        XCTAssertGreaterThan(reset.frame.midY, bounds.height * 0.72, "Portrait controls must stay on the phone's physical bottom edge.")
        XCTAssertGreaterThan(gear.frame.midX, bounds.width * 0.72, "The gear must stay in the physical portrait top-right corner.")
        XCTAssertLessThan(gear.frame.midY, bounds.height * 0.28, "The gear must stay in the physical portrait top-right corner.")
    }

    private func assertLandscapeLayout(
        in app: XCUIApplication,
        controlsOnRight: Bool,
        gearCorner: ScreenCorner
    ) {
        let window = app.windows.firstMatch
        XCTAssertTrue(waitForWindow(window, portrait: false), "The app did not settle into landscape.")

        let reset = app.buttons["Reset"]
        let soundboard = app.buttons["Open soundboard"]
        let gear = app.buttons["Workout setup button"]
        XCTAssertTrue(reset.waitForExistence(timeout: 3))
        XCTAssertTrue(soundboard.exists)
        XCTAssertTrue(gear.exists)

        let bounds = window.frame
        XCTAssertLessThan(abs(reset.frame.midX - soundboard.frame.midX), 12, "Landscape controls must form one vertical side rail.")
        if controlsOnRight {
            XCTAssertGreaterThan(reset.frame.midX, bounds.width * 0.72, "The controls must remain on the phone's physical bottom edge.")
        } else {
            XCTAssertLessThan(reset.frame.midX, bounds.width * 0.28, "The controls must remain on the phone's physical bottom edge.")
        }

        switch gearCorner {
        case .topLeft:
            XCTAssertLessThan(gear.frame.midX, bounds.width * 0.28)
            XCTAssertLessThan(gear.frame.midY, bounds.height * 0.35)
        case .bottomRight:
            XCTAssertGreaterThan(gear.frame.midX, bounds.width * 0.72)
            XCTAssertGreaterThan(gear.frame.midY, bounds.height * 0.65)
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

    private func assertSoundboardFits(in app: XCUIApplication, portrait: Bool, screenshotName: String) {
        app.buttons["Open soundboard"].tap()
        XCTAssertTrue(app.staticTexts["SOUNDBOARD"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Close soundboard"].exists)
        XCTAssertTrue(app.buttons["Final Horn"].exists)
        XCTAssertTrue(waitForWindow(app.windows.firstMatch, portrait: portrait))
        sleep(1)
        captureScreen(named: screenshotName)
        app.buttons["Close soundboard"].tap()
        XCTAssertTrue(app.buttons["Open soundboard"].waitForExistence(timeout: 3))
    }

    private func captureScreen(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
