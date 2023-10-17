import type { conform, Dict, listable } from "@arktype/util"
import {
	domainOf,
	hasKey,
	isKeyOf,
	listFrom,
	throwInternalError,
	throwParseError,
	transform
} from "@arktype/util"
import type { Out } from "arktype/internal/parser/tuple.js"
import { type BasisKind } from "../constraints/basis.js"
import {
	BaseConstraint,
	type ConstraintKind
} from "../constraints/constraint.js"
import { DomainNode } from "../constraints/domain.js"
import { ProtoNode } from "../constraints/proto.js"
import type { RefinementKind } from "../constraints/refinement.js"
import { UnitNode } from "../constraints/unit.js"
import { Disjoint } from "../disjoint.js"
import { compileSerializedValue } from "../io/compile.js"
import type { BaseAttributes, Children, Node, Schema } from "../node.js"
import { BaseNode, createReferenceId, isBaseAttributeKey } from "../node.js"
import { inferred } from "../utils.js"
import type {
	AnyIntersectionChildren,
	BasisedBranchInput,
	IntersectionSchema,
	parseIntersection,
	UnknownBranchInput,
	validateIntersectionInput
} from "./intersection.js"
import {
	irreducibleChildClasses,
	precedenceByConstraint,
	reducibleChildClasses
} from "./intersection.js"
import type {
	MorphChildren,
	MorphSchema,
	parseMorph,
	validateMorphInput
} from "./morph.js"
import type {
	BranchInput,
	BranchNode,
	UnionChildren,
	UnionSchema
} from "./union.js"

const createBranches = (branches: readonly BranchInput[]) =>
	branches.map((branch) =>
		typeof branch === "object" && hasKey(branch, "morphs")
			? MorphNode.from(branch)
			: IntersectionNode.from(branch)
	)

export abstract class TypeNode<
	t = unknown,
	children extends BaseAttributes = BaseAttributes
> extends BaseNode<children> {
	abstract kind: TypeKind

	declare infer: t;
	declare [inferred]: t
	condition = ""

	constrain<kind extends ConstraintKind>(
		kind: kind,
		definition: Schema<kind>
	): TypeNode<t> {
		return this
	}

	extractUnit(): UnitNode | undefined {
		return this.hasKind("intersection") ? this.unit : undefined
	}

	// references() {
	// 	return this.branches.flatMap((branch) => branch.references())
	// }

	keyof() {
		return this
		// return this.rule.reduce(
		// 	(result, branch) => result.and(branch.keyof()),
		// 	builtins.unknown()
		// )
	}

	allows(data: unknown) {
		return true
	}

	// TODO: inferIntersection
	and<other extends TypeNode>(other: other): TypeNode<t & other["infer"]> {
		const result = this.intersect(other)
		return result instanceof Disjoint ? result.throw() : (result as never)
	}

	abstract intersectSymmetric(
		other: Node<this["kind"]>
	): Children<TypeKind> | Disjoint | null

	abstract intersectAsymmetric(
		other: Node<TypeKind>
	): Children<TypeKind> | Disjoint | null

	intersect<other extends TypeNode>(
		other: other
	): Node<intersectTypeKinds<this["kind"], other["kind"]>> | Disjoint {
		return this as never
	}

	or<other extends TypeNode>(other: other): TypeNode<t | other["infer"]> {
		return this
	}

	isUnknown(): this is IntersectionNode<unknown> {
		return this.hasKind("intersection") ? this.constraints.length === 0 : false
	}

	isNever(): this is UnionNode<never> {
		return this.hasKind("union") ? this.branches.length === 0 : false
	}

	getPath() {
		return this
	}

	array(): TypeNode<t[]> {
		return this as never
	}

	extends<other>(other: TypeNode<other>): this is TypeNode<other> {
		const intersection = this.intersect(other)
		return !(intersection instanceof Disjoint) && this.equals(intersection)
	}
}

export type TypeInput = listable<IntersectionSchema | MorphSchema>

export class UnionNode<t = unknown> extends TypeNode<t, UnionChildren> {
	readonly kind = "union"

	defaultDescription: string

	constructor(children: UnionChildren) {
		// TODO: add kind to ids?
		super(children, {
			in: children.branches.map((constraint) => constraint.ids.in).join("|"),
			out: children.branches.map((constraint) => constraint.ids.out).join("|"),
			type: children.branches
				.map((constraint) => constraint.ids.type)
				.join("|"),
			reference: createReferenceId(
				{
					branches: children.branches
						.map((constraint) => constraint.ids.reference)
						.join("|")
				},
				children
			)
		})
		this.defaultDescription =
			this.branches.length === 0 ? "never" : this.branches.join(" or ")
	}

	static from(schema: UnionSchema) {
		return new UnionNode({
			...schema,
			branches: createBranches(schema.branches)
		})
	}

	intersectSymmetric(other: UnionNode): Disjoint | Children<TypeKind> {
		const resultBranches = intersectBranches(this.branches, other.branches)
		if (resultBranches.length === 0) {
			if (
				(this.branches.length === 0 || other.branches.length === 0) &&
				this.branches.length !== other.branches.length
			) {
				// if exactly one operand is never, we can use it to discriminate based on presence
				return Disjoint.from(
					"presence",
					this.branches.length !== 0,
					other.branches.length !== 0
				)
			}
			return Disjoint.from("union", this.branches, other.branches)
		}
		return this as never //node(...(resultBranches as any)) as never
	}

	intersectAsymmetric(
		other: Node<"morph" | "intersection">
	): Node<TypeKind> | Disjoint {
		// TODO: intersect branches
		return this
	}
}

export class MorphNode<i = any, o = unknown> extends TypeNode<
	(In: i) => Out<o>,
	MorphChildren
> {
	readonly kind = "morph"

	constructor(children: MorphChildren) {
		const inId = children.in?.ids.in ?? ""
		const outId = children.out?.ids.out ?? ""
		const morphsId = children.morphs.map((morph) =>
			compileSerializedValue(morph)
		)
		const typeId = JSON.stringify({
			in: children.in?.ids.type ?? "",
			out: children.out?.ids.type ?? "",
			morphs: morphsId
		})
		// TODO: check unknown id
		super(children, {
			in: inId,
			out: outId,
			type: typeId,
			reference: createReferenceId(
				{
					in: children.in?.ids.reference ?? "",
					out: children.out?.ids.reference ?? "",
					morphs: morphsId
				},
				children
			)
		})
	}

	defaultDescription = ""

	static from(schema: MorphSchema) {
		const children = {} as MorphChildren
		children.morphs =
			typeof schema.morphs === "function" ? [schema.morphs] : schema.morphs
		if (schema.in) {
			children.in = IntersectionNode.from(schema.in)
		}
		if (schema.out) {
			children.out = IntersectionNode.from(schema.out)
		}
		return new MorphNode(children)
	}

	intersectSymmetric(other: MorphNode): Disjoint | Children<TypeKind> {
		return this as never //node(...(resultBranches as any)) as never
	}

	intersectAsymmetric(other: Node<TypeKind>): Node<TypeKind> | Disjoint {
		return this as never
	}
}

export class IntersectionNode<
	t = unknown,
	children extends AnyIntersectionChildren = AnyIntersectionChildren
> extends TypeNode<t, AnyIntersectionChildren> {
	readonly kind = "intersection"

	readonly constraints: readonly Node<ConstraintKind>[]
	readonly basis: Node<BasisKind> | undefined
	readonly refinements: readonly Node<RefinementKind>[]
	readonly defaultDescription: string

	constructor(children: children) {
		const constraints = Object.values(children)
			.flat()
			.filter(
				(value): value is Node<ConstraintKind> =>
					value instanceof BaseConstraint
			)
			.sort((l, r) =>
				// sort by precedence, then alphabetically by kind, then by id
				precedenceByConstraint[l.kind] > precedenceByConstraint[r.kind]
					? 1
					: precedenceByConstraint[l.kind] < precedenceByConstraint[r.kind]
					? -1
					: l.kind > r.kind
					? 1
					: l.kind < r.kind
					? -1
					: // TODO: can sort only based on this?
					l.ids.reference > r.ids.reference
					? 1
					: -1
			)
		const initialConstraint = constraints.at(0)
		const basis = initialConstraint?.isBasis() ? initialConstraint : undefined
		const refinements = basis ? constraints.slice(1) : constraints
		assertValidRefinements(basis, refinements)
		super(children, {
			in: constraints.map((constraint) => constraint.ids.in).join("&"),
			out: constraints.map((constraint) => constraint.ids.out).join("&"),
			type: constraints.map((constraint) => constraint.ids.type).join("&"),
			reference: createReferenceId(
				{
					constraints: constraints
						.map((constraint) => constraint.ids.reference)
						.join("&")
				},
				children
			)
		})
		this.constraints = constraints
		this.refinements = refinements
		this.basis = basis
		this.defaultDescription = this.constraints.length
			? this.constraints.join(" and ")
			: "a value"
	}

	static from(schema: IntersectionSchema) {
		const children = parseIntersectionChildren(schema)
		return new IntersectionNode(children)
	}

	intersectSymmetric(
		other: IntersectionNode
	): AnyIntersectionChildren | Disjoint {
		let constraints: readonly Node<ConstraintKind>[] | Disjoint =
			this.constraints
		for (const constraint of other.constraints) {
			if (constraints instanceof Disjoint) {
				break
			}
			constraints = this.addConstraint(constraint)
		}
		if (constraints instanceof Disjoint) {
			return constraints
		}
		const children: AnyIntersectionChildren = {}
		for (const node of constraints) {
			if (isKeyOf(node.kind, irreducibleChildClasses)) {
				children[node.kind] ??= []
				children[node.kind]!.push(node as never)
			} else {
				children[node.kind] = node as never
			}
		}
		return children
	}

	intersectAsymmetric() {
		return null
	}

	protected addConstraint(
		constraint: Node<ConstraintKind>
	): readonly Node<ConstraintKind>[] | Disjoint {
		const result: Node<ConstraintKind>[] = []
		let includesConstraint = false
		for (let i = 0; i < this.constraints.length; i++) {
			const elementResult = constraint.intersectConstraint(this.constraints[i])
			if (elementResult === null) {
				result.push(this.constraints[i])
			} else if (elementResult instanceof Disjoint) {
				return elementResult
			} else if (!includesConstraint) {
				result.push(elementResult)
				includesConstraint = true
			} else if (!result.includes(elementResult)) {
				return throwInternalError(
					`Unexpectedly encountered multiple distinct intersection results for constraint ${elementResult}`
				)
			}
		}
		if (!includesConstraint) {
			result.push(this as never)
		}
		return result
	}
}

const assertValidRefinements: (
	basis: Node<BasisKind> | undefined,
	refinements: Node<ConstraintKind>[]
) => asserts refinements is Node<RefinementKind>[] = (basis, refinements) => {
	for (const refinement of refinements) {
		if (!refinement.applicableTo(basis)) {
			throwParseError(
				`Refinement of kind ${refinement.kind} is not allowed by basis ${basis}`
			)
		}
	}
}

const parseIntersectionChildren = (
	schema: IntersectionSchema
): AnyIntersectionChildren => {
	switch (typeof schema) {
		case "string":
			return { domain: DomainNode.from(schema) }
		case "function":
			return { proto: ProtoNode.from(schema) }
		case "object":
			return parseIntersectionObjectSchema(schema)
		default:
			return throwParseError(
				`${domainOf(schema)} is not a valid intersection schema input.`
			)
	}
}

const parseIntersectionObjectSchema = (
	schema: UnknownBranchInput | BasisedBranchInput
): AnyIntersectionChildren =>
	transform(schema as Dict, ([k, input]) => {
		switch (true) {
			case isBaseAttributeKey(k):
				return [k, input]
			case isKeyOf(k, reducibleChildClasses):
				const node = (reducibleChildClasses as any)[k].from(input)
				return [k, node]
			case isKeyOf(k, irreducibleChildClasses):
				return [
					k,
					listFrom(input).map((constraintInput) =>
						(irreducibleChildClasses as any)[k].from(constraintInput)
					)
				]
			default:
				return throwParseError(`Unexpected intersection schema key '${k}'`)
		}
	})

const parseNode = (...branches: BranchInput[]) => {
	const constraintSets = createBranches(branches)
	// DO reduce bitach
	if (constraintSets.length === 1) {
		return constraintSets[0]
	}
	return new UnionNode({ branches: constraintSets })
}

const parseUnits = (...branches: unknown[]) => {
	return parseNode(...branches.map((value) => new UnitNode({ rule: value })))
}

export const node = Object.assign(parseNode as NodeParser, {
	units: parseUnits as UnitsNodeParser
})

type NodeParser = {
	<const branches extends readonly unknown[]>(
		...branches: {
			[i in keyof branches]: validateBranchInput<branches[i]>
		}
	): parseNode<branches>
}

type parseNode<branches extends readonly unknown[]> = {
	[i in keyof branches]: parseBranch<branches[i]>
}[number] extends infer t
	? branches["length"] extends 1
		? t
		: TypeNode<t>
	: never

export type validateBranchInput<input> = conform<
	input,
	"morphs" extends keyof input
		? validateMorphInput<input>
		: validateIntersectionInput<input>
>

type parseBranch<branch> = branch extends MorphSchema
	? parseMorph<branch>
	: branch extends IntersectionSchema
	? parseIntersection<branch>
	: IntersectionNode

type UnitsNodeParser = {
	<const branches extends readonly unknown[]>(
		...branches: branches
	): TypeNode<branches[number]>
}

type intersectTypeKinds<
	l extends TypeKind,
	r extends TypeKind
> = "union" extends l | r
	? TypeKind
	: "morph" extends l | r
	? "morph"
	: "intersection"

export type TypeClassesByKind = {
	union: typeof UnionNode
	morph: typeof MorphNode
	intersection: typeof IntersectionNode
}

export type TypeKind = keyof TypeClassesByKind

export const intersectBranches = (
	l: readonly BranchNode[],
	r: readonly BranchNode[]
): readonly BranchNode[] => {
	// Branches that are determined to be a subtype of an opposite branch are
	// guaranteed to be a member of the final reduced intersection, so long as
	// each individual set of branches has been correctly reduced to exclude
	// redundancies.
	const finalBranches: BranchNode[] = []
	// Each rBranch is initialized to an empty array to which distinct
	// intersections will be appended. If the rBranch is identified as a
	// subtype or equal of any lBranch, the corresponding value should be
	// set to null so we can avoid including previous/future intersections
	// in the final result.
	const candidatesByR: (BranchNode[] | null)[] = r.map(() => [])
	for (let lIndex = 0; lIndex < l.length; lIndex++) {
		const lBranch = l[lIndex]
		let currentCandidateByR: { [rIndex in number]: BranchNode } = {}
		for (let rIndex = 0; rIndex < r.length; rIndex++) {
			const rBranch = r[rIndex]
			if (!candidatesByR[rIndex]) {
				// we've identified rBranch as a subtype of
				// an lBranch and will not yield any distinct intersections.
				continue
			}
			if (lBranch === rBranch) {
				// Combination of subtype and supertype cases
				finalBranches.push(lBranch)
				candidatesByR[rIndex] = null
				currentCandidateByR = {}
				break
			}
			const branchIntersection = lBranch.intersect(rBranch)
			if (branchIntersection instanceof Disjoint) {
				// doesn't tell us about any redundancies or add a distinct intersection
				continue
			}
			if (branchIntersection === lBranch) {
				// If l is a subtype of the current r branch, intersections
				// with previous and remaining branches of r won't lead to
				// distinct intersections, so empty currentCandidatesByR and break
				// from the inner loop.
				finalBranches.push(lBranch)
				currentCandidateByR = {}
				break
			}
			if (branchIntersection === rBranch) {
				// If r is a subtype of the current l branch, set its
				// intersections to null, removing any previous
				// intersections and preventing any of its
				// remaining intersections from being computed.
				finalBranches.push(rBranch)
				candidatesByR[rIndex] = null
				continue
			}
			// If neither l nor r is a subtype of the other, add their
			// intersection as a candidate to the current batch (could
			// still be removed if it is determined l or r is a subtype
			// of a remaining branch).
			currentCandidateByR[rIndex] = branchIntersection
		}
		for (const rIndex in currentCandidateByR) {
			// candidatesByR at rIndex should never be null if it is in currentCandidates
			candidatesByR[rIndex]!.push(currentCandidateByR[rIndex])
		}
	}
	// All remaining candidates are distinct, so include them in the final result
	for (const candidates of candidatesByR) {
		candidates?.forEach((candidate) => finalBranches.push(candidate))
	}
	return finalBranches
}
