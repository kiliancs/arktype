import {
	listFrom,
	throwParseError,
	type BuiltinObjectKind,
	type BuiltinObjects,
	type Primitive,
	type evaluate,
	type listable
} from "@arktype/util"
import type { Node } from "../base.js"
import type { Schema } from "../kinds.js"
import type { StaticArkOption } from "../scope.js"
import type { CompilationContext } from "../shared/compile.js"
import type { BaseMeta, declareNode } from "../shared/declare.js"
import { Disjoint } from "../shared/disjoint.js"
import {
	basisKinds,
	type BasisKind,
	type kindOrRightward,
	type nodeImplementationOf
} from "../shared/implement.js"
import type { is } from "../shared/utils.js"
import type {
	TraversalContext,
	TraverseAllows,
	TraverseApply
} from "../traversal/context.js"
import type { ArkResult, ArkTypeError } from "../traversal/errors.js"
import { BaseType } from "../type.js"

export type ValidatorKind = evaluate<"intersection" | BasisKind>

export type ValidatorNode = Node<ValidatorKind>

export type ValidatorDefinition = Schema<ValidatorKind>

export type Morph<i = any, o = unknown> = (In: i, ctx: TraversalContext) => o

export type Out<o = any> = ["=>", o]

export type MorphAst<i = any, o = any> = (In: i) => Out<o>

export interface MorphInner extends BaseMeta {
	readonly in: ValidatorNode
	readonly out: ValidatorNode
	readonly morph: readonly Morph[]
}

export interface MorphSchema extends BaseMeta {
	readonly in: ValidatorDefinition
	readonly out?: ValidatorDefinition
	readonly morph: listable<Morph>
}

export type MorphDeclaration = declareNode<{
	kind: "morph"
	schema: MorphSchema
	normalizedSchema: MorphSchema
	inner: MorphInner
	composition: "composite"
	disjoinable: true
	childKind: ValidatorKind
}>

export class MorphNode<t = unknown> extends BaseType<
	t,
	MorphDeclaration,
	typeof MorphNode
> {
	// TODO: recursively extract in?
	static implementation: nodeImplementationOf<MorphDeclaration> =
		this.implement({
			hasAssociatedError: true,
			keys: {
				in: {
					child: true,
					parse: (schema, ctx) =>
						ctx.$.parseTypeNode(schema, ["intersection", ...basisKinds])
				},
				out: {
					child: true,
					parse: (schema, ctx) =>
						ctx.$.parseTypeNode(schema, ["intersection", ...basisKinds])
				},
				morph: {
					parse: listFrom
				}
			},
			normalize: (schema) => schema,
			defaults: {
				description(inner) {
					return `a morph from ${inner.in} to ${inner.out}`
				}
			}
		})

	traverseAllows: TraverseAllows = (data, ctx) =>
		this.in.traverseAllows(data, ctx)

	traverseApply: TraverseApply = (data, ctx) => this.in.traverseApply(data, ctx)

	protected intersectOwnInner(r: MorphNode<any>) {
		if (this.morph.some((morph, i) => morph !== r.morph[i])) {
			// TODO: is this always a parse error? what about for union reduction etc.
			// TODO: check in for union reduction
			return throwParseError(`Invalid intersection of morphs`)
		}
		const inTersection = this.in.intersect(r.in)
		if (inTersection instanceof Disjoint) {
			return inTersection
		}
		const outTersection = this.out.intersect(r.out)
		if (outTersection instanceof Disjoint) {
			return outTersection
		}
		return {
			morph: this.morph,
			in: inTersection,
			out: outTersection
		}
	}

	intersectRightward(r: Node<kindOrRightward<"morph">>): MorphInner | Disjoint {
		switch (r.kind) {
			case "morph":
				return this.intersectOwnInner(r)
			case "intersection":
				const inTersection = this.in.intersect(r)
				return inTersection instanceof Disjoint
					? inTersection
					: {
							...this.inner,
							in: inTersection
					  }
			default:
				const constrainedInput = this.in.intersect(r)
				return constrainedInput instanceof Disjoint
					? constrainedInput
					: {
							...this.inner,
							in: constrainedInput
					  }
		}
	}

	override get in(): Node<ValidatorKind, extractIn<t>> {
		return this.inner.in
	}

	override get out(): Node<ValidatorKind, extractOut<t>> {
		return this.inner.out ?? this.$.builtin.unknown
	}

	compileApply(ctx: CompilationContext): string {
		return this.in.compileApply(ctx)
	}

	compileAllows(ctx: CompilationContext): string {
		return this.in.compileAllows(ctx)
	}
}

export type inferMorphOut<out> = out extends ArkResult<infer t>
	? out extends null
		? // avoid treating any/never as CheckResult
		  out
		: t
	: Exclude<out, ArkTypeError>

export type distill<t> = includesMorphs<t> extends true
	? distillRecurse<t, "out", "base">
	: t

export type extractIn<t> = includesMorphs<t> extends true
	? distillRecurse<t, "in", "refined">
	: t

export type extractOut<t> = includesMorphs<t> extends true
	? distillRecurse<t, "out", "refined">
	: t

export type includesMorphs<t> = [
	t,
	distillRecurse<t, "in", "base">,
	t,
	distillRecurse<t, "out", "base">
] extends [
	distillRecurse<t, "in", "base">,
	t,
	distillRecurse<t, "out", "base">,
	t
]
	? false
	: true

type distillRecurse<
	t,
	io extends "in" | "out",
	refinements extends "base" | "refined"
> = t extends MorphAst<infer i, infer o>
	? io extends "in"
		? i
		: o
	: t extends is<infer base>
	? refinements extends "base"
		? distillRecurse<base, io, refinements>
		: t
	: t extends TerminallyInferredObjectKind | Primitive
	? t
	: { [k in keyof t]: distillRecurse<t[k], io, refinements> }

/** Objects we don't want to expand during inference like Date or Promise */
type TerminallyInferredObjectKind =
	| StaticArkOption<"preserve">
	| BuiltinObjects[Exclude<BuiltinObjectKind, "Array">]
