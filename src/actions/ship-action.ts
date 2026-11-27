// SPDX-License-Identifier: MPL-2.0
import { action } from "@elgato/streamdeck";
import { ShipCommandAction } from "./ship-command-action.js";

/** Commandes vaisseau et siège, avec l'état affiché sur la touche pour les fonctions qui en ont un. */
@action({ UUID: "com.sokren.sc-telemetry.ship-action" })
export class ShipAction extends ShipCommandAction {}
