// SPDX-License-Identifier: MPL-2.0
import protobuf from "protobufjs";
import { PACKAGE, type GameSchema } from "./schema.js";

/** Champ du schéma du jeu, en arbre (mode debug : montrer les champs prévus mais jamais envoyés). */
export type SchemaField = {
	name: string;
	/** Nom du type : scalaire (`float`, `bool`…), énumération ou message (nom court). */
	type: string;
	kind: "scalar" | "enum" | "message";
	repeated?: true;
	/** Champ `optional` de proto3 : son absence a un sens (sinon absent = valeur par défaut). */
	optional?: true;
	/**
	 * Valeur d'un champ simple quand le jeu ne l'envoie pas (proto3 ne transmet pas les valeurs nulles) :
	 * `false`, `0`, `""` ou le nom de la valeur 0 d'une énumération. Absente pour les messages, listes et `optional`.
	 */
	default?: boolean | number | string;
	/** Champs d'un message ; absents si le type est déjà ouvert plus haut (boucle). */
	fields?: SchemaField[];
};

const shortName = (t: protobuf.ReflectionObject) => t.fullName.replace(/^\./, "").replace(`${PACKAGE}.`, "");

function isOptional(f: protobuf.Field): boolean {
	const opts = f.options as Record<string, unknown> | undefined;
	if (opts?.proto3_optional === true) return true;
	// Les champs optional de proto3 vivent dans un oneof synthétique « _nom ».
	return !!f.partOf && f.partOf.name === `_${f.name}` && f.partOf.fieldsArray.length === 1;
}

function fieldsOf(type: protobuf.Type, open: Set<string>): SchemaField[] {
	return type.fieldsArray.map((f) => {
		f.resolve();
		const node: SchemaField = { name: f.name, type: f.type, kind: "scalar" };
		if (f.repeated) node.repeated = true;
		if (isOptional(f)) node.optional = true;
		const r = f.resolvedType;
		if (r instanceof protobuf.Enum) {
			node.kind = "enum";
			node.type = shortName(r);
			const zero = Object.entries(r.values).find(([, v]) => v === 0)?.[0];
			if (zero !== undefined && !node.repeated && !node.optional) node.default = zero;
		} else if (r instanceof protobuf.Type) {
			node.kind = "message";
			node.type = shortName(r);
			if (!open.has(r.fullName)) node.fields = fieldsOf(r, new Set([...open, r.fullName]));
		} else if (!node.repeated && !node.optional) {
			node.default = f.type === "bool" ? false : f.type === "string" || f.type === "bytes" ? "" : 0;
		}
		return node;
	});
}

/** Sections du flux (`vehicle`, `actor`…) et leurs champs, d'après `TelemetryStreamResponse`. */
export function streamSchemaTree(schema: GameSchema): SchemaField[] {
	const root = schema.type("TelemetryStreamResponse");
	return fieldsOf(root, new Set([root.fullName]));
}
