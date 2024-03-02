import { compileSerializedValue } from "@arktype/util"
import type { Node, TypeSchema } from "../../base.js"
import type { NodeCompiler } from "../../shared/compile.js"
import type { TraverseAllows, TraverseApply } from "../../shared/context.js"
import type { BaseMeta, declareNode } from "../../shared/declare.js"
import { Disjoint } from "../../shared/disjoint.js"
import {
	throwInvalidOperandError,
	type TypeKind,
	type nodeImplementationOf
} from "../../shared/implement.js"
import type { BaseConstraint, FoldInput } from "../constraint.js"
import { BasePropConstraint } from "./prop.js"
import { compileKey } from "./shared.js"

export interface RequiredSchema extends BaseMeta {
	readonly key: string | symbol
	readonly value: TypeSchema
}

export interface RequiredInner extends BaseMeta {
	readonly key: string | symbol
	readonly value: Node<TypeKind>
}

export type RequiredDeclaration = declareNode<{
	kind: "required"
	schema: RequiredSchema
	normalizedSchema: RequiredSchema
	inner: RequiredInner
	expectedContext: {
		code: "required"
		key: string | symbol
	}
	composition: "composite"
	prerequisite: object
	hasOpenIntersection: true
	disjoinable: true
	childKind: TypeKind
}>

export class RequiredNode
	extends BasePropConstraint<RequiredDeclaration, typeof RequiredNode>
	implements BaseConstraint<"required">
{
	static implementation: nodeImplementationOf<RequiredDeclaration> =
		this.implement({
			hasAssociatedError: true,
			hasOpenIntersection: true,
			keys: {
				key: {},
				value: {
					child: true,
					parse: (schema, ctx) => ctx.$.parseTypeNode(schema)
				}
			},
			normalize: (schema) => schema,
			defaults: {
				description(inner) {
					return `${compileKey(inner.key)}: ${inner.value}`
				},
				expected() {
					return "provided"
				},
				actual: () => null
			},
			intersectSymmetric: (l, r) => {
				if (l.key !== r.key) {
					return null
				}
				const key = l.key
				const value = l.value.intersect(r.value)
				if (value instanceof Disjoint) {
					return value
				}
				return l.$.parse("required", {
					key,
					value
				})
			}
		})

	readonly serializedKey = compileSerializedValue(this.key)
	readonly baseRequiredErrorContext = Object.freeze({
		code: "required",
		key: this.key
	})

	traverseAllows: TraverseAllows<object> = (data, ctx) => {
		if (this.key in data) {
			return this.value.traverseAllows((data as any)[this.key], ctx)
		}
		return false
	}

	traverseApply: TraverseApply<object> = (data, ctx) => {
		if (this.key in data) {
			this.value.traverseApply((data as any)[this.key], ctx)
		} else {
			ctx.error(this.baseRequiredErrorContext)
		}
	}

	compile(js: NodeCompiler) {
		js.if(`${this.serializedKey} in ${js.data}`, () =>
			js.checkLiteralKey(this.key, this.value)
		).else(() =>
			js.traversalKind === "Allows"
				? js.return(false)
				: js.line(
						`${js.ctx}.error(${JSON.stringify(this.baseRequiredErrorContext)})`
				  )
		)
		if (js.traversalKind === "Allows") {
			js.return(true)
		}
	}

	foldIntersection(into: FoldInput<"required">) {
		if (into.basis?.domain !== "object") {
			throwInvalidOperandError("required", "an object", into.basis)
		}

		if (!into.required) {
			into.required = [this]
			return
		}

		let matchedExisting = false
		for (let i = 0; i < into.required.length; i++) {
			const result = this.intersectSymmetric(into.required[i])
			if (result === null) continue
			if (result instanceof Disjoint) return result
			into.required[i] = result
			matchedExisting = true
		}
		if (!matchedExisting) into.required.push(this)
	}
}
