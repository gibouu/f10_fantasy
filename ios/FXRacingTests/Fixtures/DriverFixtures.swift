@testable import FXRacing

enum DriverFixtures {
    static let constructor = DriverConstructor(id: "mclaren", name: "McLaren", shortName: "MCL", color: "FF8700", slug: "mclaren", logoUrl: nil)
    static let norris = Driver(id: "norris", code: "NOR", firstName: "Lando", lastName: "Norris", number: 4, photoUrl: nil, seatKey: "mclaren-1", constructor: constructor)
    static let piastri = Driver(id: "piastri", code: "PIA", firstName: "Oscar", lastName: "Piastri", number: 81, photoUrl: nil, seatKey: "mclaren-2", constructor: constructor)
    static let leclerc = Driver(id: "leclerc", code: "LEC", firstName: "Charles", lastName: "Leclerc", number: 16, photoUrl: nil, seatKey: "ferrari-1", constructor: DriverConstructor(id: "ferrari", name: "Ferrari", shortName: "FER", color: "E80020", slug: "ferrari", logoUrl: nil))
}
