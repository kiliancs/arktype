import { domainOf, printable } from "@arktype/util"
import type { CompilationContext, TraverseApply } from "../scope.js"
import type { declareNode, withAttributes } from "../shared/declare.js"
import type { NodeParserImplementation } from "../shared/define.js"
import { Disjoint } from "../shared/disjoint.js"
import type { NodeIntersections } from "../shared/intersect.js"
import { compileSerializedValue } from "../shared/registry.js"
import { BaseBasis } from "./basis.js"
import { BaseType } from "./type.js"

export type UnitSchema<value = unknown> = withAttributes<UnitInner<value>>

export type UnitInner<value = unknown> = {
	readonly unit: value
}

export type UnitDeclaration = declareNode<{
	kind: "unit"
	schema: UnitSchema
	normalizedSchema: UnitSchema
	inner: UnitInner
	intersections: {
		unit: "unit" | Disjoint
		default: "unit" | Disjoint
	}
}>

export class UnitNode<t = unknown> extends BaseBasis<t, UnitDeclaration> {
	static parser: NodeParserImplementation<UnitDeclaration> = {
		keys: {
			unit: {
				preserveUndefined: true
			}
		},
		normalize: (schema) => schema
	}

	static intersections: NodeIntersections<UnitDeclaration> = {
		unit: (l, r) => Disjoint.from("unit", l, r),
		default: (l, r) =>
			r.allows(l.unit as never) ? l : Disjoint.from("assignability", l.unit, r)
	}

	serializedValue = compileSerializedValue(this.unit)
	traverseAllows = (data: unknown) => data === this.unit

	basisName = printable(this.unit)
	domain = domainOf(this.unit)
	condition = `${this.scope.argName} === ${this.serializedValue}`
	negatedCondition = `${this.scope.argName} !== ${this.serializedValue}`

	writeDefaultDescription() {
		return this.basisName
	}
}
