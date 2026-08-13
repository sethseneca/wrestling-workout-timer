import XCTest

final class WrestlingTimerUITests: XCTestCase {
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

    private func captureScreen(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
