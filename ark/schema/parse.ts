import {
	entriesOf,
	hasDomain,
	includes,
	isArray,
	stringify,
	throwParseError,
	type Json
} from "@arktype/util"
import type { BaseNode, Node, UnknownNode } from "./base.js"
import { maybeGetBasisKind } from "./bases/basis.js"
import type { parseSchemaBranches, validateSchemaBranch } from "./sets/union.js"
import {
	defaultInnerKeySerializer,
	refinementKinds,
	type NodeKind,
	type SchemaKind,
	type SchemaParseContext,
	type SchemaParseContextInput,
	type UnknownNodeImplementation
} from "./shared/define.js"
import {
	NodeImplementationByKind,
	type Definition,
	type Inner,
	type NormalizedDefinition,
	type childKindOf,
	type reducibleKindOf
} from "./shared/nodes.js"
import { isNode, registry } from "./shared/registry.js"

export type validateScopeSchema<def, $> = {
	[k in keyof def]: {}
}
export type BaseAttachments<kind extends NodeKind> = {
	readonly kind: kind
	readonly inner: Inner<kind>
	readonly entries: entriesOf<Inner<kind>>
	readonly json: Json
	readonly typeJson: Json
	readonly collapsibleJson: Json
	readonly children: Node<childKindOf<kind>>[]
	readonly id: string
	readonly typeId: string
}

export const parseUnion = <const branches extends readonly unknown[]>(
	input: {
		branches: {
			[i in keyof branches]: validateSchemaBranch<branches[i]>
		}
	} & NormalizedDefinition<"union">
): parseSchemaBranches<branches> => parseNode("union", input) as never

export const parseBranches = <const branches extends readonly unknown[]>(
	...branches: {
		[i in keyof branches]: validateSchemaBranch<branches[i]>
	}
): parseSchemaBranches<branches> => parseNode("union", branches) as never

export const parseUnits = <const branches extends readonly unknown[]>(
	...values: branches
): branches["length"] extends 1
	? Node<"unit", branches[0]>
	: Node<"union" | "unit", branches[number]> => {
	const uniqueValues: unknown[] = []
	for (const value of values) {
		if (!uniqueValues.includes(value)) {
			uniqueValues.push(value)
		}
	}
	const branches = uniqueValues.map((unit) =>
		parsePrereducedSchema("unit", { is: unit })
	)
	if (branches.length === 1) {
		return branches[0]
	}
	return parsePrereducedSchema("union", {
		branches
	}) as never
}

export const parsePrereducedSchema = <kind extends SchemaKind>(
	kind: kind,
	input: Definition<kind>
): Node<kind> =>
	parseNode(kind, input, {
		prereduced: true
	}) as never

export const parseSchemaFromKinds = <defKind extends SchemaKind>(
	allowedKinds: readonly defKind[],
	input: unknown
): Node<reducibleKindOf<defKind>> => {
	const kind = schemaKindOf(input)
	if (!allowedKinds.includes(kind as never)) {
		return throwParseError(
			`Schema of kind ${kind} should be one of ${allowedKinds}`
		)
	}
	return parseNode(kind, input as never, {}) as never
}

const parseCache: Record<string, unknown> = {}

export const parseNode = <defKind extends NodeKind>(
	kind: defKind,
	input: Definition<defKind>,
	ctxInput?: SchemaParseContextInput
): Node<reducibleKindOf<defKind>> => {
	if (isNode(input)) {
		return input as never
	}
	const cls = registry().BaseNode as typeof BaseNode
	const implementation: UnknownNodeImplementation = NodeImplementationByKind[
		kind
	] as never
	const inner: Record<string, unknown> = {}
	const normalizedInput: any = implementation.normalize?.(input) ?? input
	const ctx: SchemaParseContext<any> = {
		...ctxInput,
		input: normalizedInput,
		cls
	}
	implementation.addContext?.(ctx)
	const schemaEntries = entriesOf(normalizedInput).sort((l, r) =>
		l[0] < r[0] ? -1 : 1
	)
	let json: Record<string, unknown> = {}
	let typeJson: Record<string, unknown> = {}
	const children: UnknownNode[] = []
	for (const [k, v] of schemaEntries) {
		const keyDefinition = implementation.keys[k]
		if (!(k in implementation.keys)) {
			return throwParseError(`Key ${k} is not valid on ${kind} schema`)
		}
		const innerValue = keyDefinition.parse ? keyDefinition.parse(v, ctx) : v
		if (innerValue === undefined && !keyDefinition.preserveUndefined) {
			continue
		}
		inner[k] = innerValue
		if (isNode(innerValue)) {
			json[k] = innerValue.collapsibleJson
			children.push(innerValue)
		} else if (
			isArray(innerValue) &&
			innerValue.every((_): _ is UnknownNode => isNode(_))
		) {
			json[k] = innerValue.map((node) => node.collapsibleJson)
			children.push(...innerValue)
		} else {
			json[k] = keyDefinition.serialize
				? keyDefinition.serialize(v)
				: defaultInnerKeySerializer(v)
		}
		if (!keyDefinition.meta) {
			typeJson[k] = json[k]
		}
	}
	if (!ctx.prereduced) {
		if (implementation.reduce) {
			const reduced = implementation.reduce(inner, ctx)
			if (reduced) {
				return reduced as never
			}
		}
	}
	const innerEntries = entriesOf(inner)
	let collapsibleJson = json
	if (
		innerEntries.length === 1 &&
		innerEntries[0][0] === implementation.collapseKey
	) {
		collapsibleJson = json[implementation.collapseKey] as never
		if (hasDomain(collapsibleJson, "object")) {
			json = collapsibleJson
			typeJson = collapsibleJson
		}
	}
	const id = kind + JSON.stringify(json)
	if (id in parseCache) {
		return parseCache[id] as never
	}
	const typeId = kind + JSON.stringify(typeJson)
	if (cls.isInitialized && cls.builtins.unknownUnion.typeId === typeId) {
		return cls.builtins.unknown as never
	}
	const attachments = {
		kind,
		inner,
		entries: innerEntries,
		json,
		typeJson,
		collapsibleJson,
		children,
		id,
		typeId
	} satisfies Record<keyof BaseAttachments<any>, unknown>
	return includes(refinementKinds, kind)
		? new (cls as any)(attachments)
		: new (registry() as any).SchemaNode(attachments)
}

const schemaKindOf = (input: unknown): SchemaKind => {
	const basisKind = maybeGetBasisKind(input)
	if (basisKind) {
		return basisKind
	}
	if (typeof input === "object" && input !== null) {
		if (isNode(input)) {
			if (input.isSchema()) {
				return input.kind
			}
			// otherwise, error at end of function
		} else if ("morph" in input) {
			return "morph"
		} else if ("branches" in input || isArray(input)) {
			return "union"
		} else {
			return "intersection"
		}
	}
	return throwParseError(`${stringify(input)} is not a valid type schema`)
}