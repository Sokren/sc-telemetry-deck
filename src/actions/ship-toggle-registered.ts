import { action } from "@elgato/streamdeck";
import { ShipCommandAction } from "./ship-command-action.js";

/**
 * Ancienne action « Ship Toggle », fusionnée dans Ship Action (0.3.14) : masquée de la liste du Stream Deck,
 * gardée pour que les touches déjà posées continuent de marcher (réglages convertis à l'apparition).
 */
@action({ UUID: "com.sokren.sc-telemetry.ship-toggle" })
export class ShipToggleRegistered extends ShipCommandAction {}
