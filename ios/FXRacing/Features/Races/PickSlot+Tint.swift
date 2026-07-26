import SwiftUI

extension PickSlot {
    /// Colour coding shared by the pick rows and the driver picker.
    ///
    /// The card teaches this mapping — P1 red, P10 gold, DNF danger — before
    /// the picker ever opens, so reusing it there costs the player nothing to
    /// learn. Kept in one place so the two surfaces cannot drift apart.
    var tint: Color {
        switch self {
        case .winner: FXTheme.Colors.accent
        case .p10:    FXTheme.Colors.gold
        case .dnf:    FXTheme.Colors.danger
        }
    }
}
