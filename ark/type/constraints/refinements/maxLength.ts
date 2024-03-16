import type { declareNode } from "../../shared/declare.js"
import { Disjoint } from "../../shared/disjoint.js"
import type { nodeImplementationOf } from "../../shared/implement.js"
import {
	BaseRange,
	parseExclusiveKey,
	type BaseNormalizedRangeSchema,
	type BaseRangeInner,
	type LengthBoundableData,
	type boundToIs
} from "./range.js"

export type maxLength<n extends number> = boundToIs<"maxLength", n>

export interface MaxLengthInner extends BaseRangeInner {
	rule: number
}

export interface NormalizedMaxLengthSchema extends BaseNormalizedRangeSchema {
	rule: number
}

export type MaxLengthSchema = NormalizedMaxLengthSchema | number

export type MaxLengthDeclaration = declareNode<{
	kind: "maxLength"
	schema: MaxLengthSchema
	normalizedSchema: NormalizedMaxLengthSchema
	inner: MaxLengthInner
	prerequisite: LengthBoundableData
	errorContext: MaxLengthInner
}>

export class MaxLengthNode extends BaseRange<MaxLengthDeclaration> {
	static implementation: nodeImplementationOf<MaxLengthDeclaration> =
		this.implement({
			collapsibleKey: "rule",
			hasAssociatedError: true,
			keys: {
				rule: {},
				exclusive: parseExclusiveKey
			},
			normalize: (schema) =>
				typeof schema === "number" ? { rule: schema } : schema,
			defaults: {
				description(node) {
					return node.exclusive
						? `less than length ${node.rule}`
						: `at most length ${node.rule}`
				},
				actual: (data) => `${data.length}`
			},
			intersections: {
				maxLength: (l, r) => (l.isStricterThan(r) ? l : r),
				minLength: (max, min, $) =>
					max.overlapsRange(min)
						? max.overlapIsUnit(min)
							? $.node("exactLength", { rule: max.rule })
							: null
						: Disjoint.from("range", max, min)
			}
		})

	readonly impliedBasis = this.$.type("string|Array")

	traverseAllows = this.exclusive
		? (data: LengthBoundableData) => data.length < this.rule
		: (data: LengthBoundableData) => data.length <= this.rule
}
