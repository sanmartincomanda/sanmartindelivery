import XCTest

final class StoreScreenshots: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.sanmartinsr.app")

    func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testGuestShoppingScreens() {
        continueAfterFailure = false
        app.launch()
        let browse = app.buttons["Navegar catalogo"]
        XCTAssertTrue(browse.waitForExistence(timeout: 40), app.debugDescription)
        XCTAssertTrue(app.buttons["Continuar con Apple"].exists)
        capture("01-Ingresar")
        browse.tap()
        sleep(8)
        for label in ["Cerrar anuncio de cajas", "Cerrar anuncio", "Cerrar promocion", "Cerrar horario"] {
            if app.buttons[label].exists && app.buttons[label].isHittable { app.buttons[label].tap() }
        }
        capture("02-Tienda")

        let product = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Ver ' AND (label CONTAINS 'BISTEC' OR label CONTAINS 'CAJA' OR label CONTAINS 'CORBATA')")).firstMatch
        for _ in 0..<6 {
            if product.exists && product.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(product.exists && product.isHittable, app.debugDescription)
        product.tap()
        sleep(3)
        capture("03-Producto")
        let add = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Agregar al carrito'")).firstMatch
        for _ in 0..<3 {
            if add.exists && add.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(add.exists && add.isHittable, app.debugDescription)
        add.tap()
        let cart = app.buttons["Abrir carrito"]
        XCTAssertTrue(cart.waitForExistence(timeout: 10), app.debugDescription)
        cart.tap()
        sleep(2)
        capture("04-Carrito")
        // Never place an order or alter customer/business records in this UI test.
    }
}
