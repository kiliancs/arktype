import type { ErrorMessage, describe, evaluate } from "@arktype/util"
import type { Prerequisite, Schema } from "../kinds.js"
import type { writeInvalidOperandMessage } from "../shared/implement.js"
import type { PrimitiveConstraintKind } from "./constraint.js"
import type { predicate } from "./predicate.js"
import type { after } from "./refinements/after.js"
import type { before } from "./refinements/before.js"
import type { divisor } from "./refinements/divisor.js"
import type { length } from "./refinements/length.js"
import type { max } from "./refinements/max.js"
import type { maxLength } from "./refinements/maxLength.js"
import type { min } from "./refinements/min.js"
import type { minLength } from "./refinements/minLength.js"
import type { LimitSchemaValue } from "./refinements/range.js"
import type { regex } from "./refinements/regex.js"

export type Comparator = "<" | "<=" | ">" | ">=" | "=="

export type BoundConstraints = { [k in Comparator]?: LimitSchemaValue }

export type RegexLiteral<source extends string = string> = `/${source}/`

export type DateLiteral<source extends string = string> =
	| `d"${source}"`
	| `d'${source}'`

export type Constraints = evaluate<
	BoundConstraints & {
		[k: DateLiteral | RegexLiteral]: true
		"%"?: number
		":"?: true
	}
>

export type of<basis> = {
	basis: basis
}

export type intersectConstrainables<l, r> = [l, r] extends [
	of<infer lInner> & infer lConstraints,
	of<infer rInner> & infer rConstraints
]
	? of<lInner & rInner> & lConstraints & rConstraints
	: l extends of<infer lInner> & infer lConstraints
	? of<lInner & r> & lConstraints
	: r extends of<infer rInner> & infer rConstraints
	? of<l & rInner> & rConstraints
	: l & r

export type LimitLiteral = number | DateLiteral

export type validateConstraintArg<
	kind extends PrimitiveConstraintKind,
	In
> = In extends Prerequisite<kind>
	? Schema<kind>
	: ErrorMessage<
			writeInvalidOperandMessage<
				kind,
				describe<Prerequisite<kind>>,
				describe<In>
			>
	  >

export type constrain<In, constraint> = In extends of<infer base> &
	infer constraints
	? of<base> & constraints & constraint
	: of<In> & constraint

type Bases<rule> = {
	divisor: divisor<rule & number>
	min: min<rule & number>
	max: max<rule & number>
	minLength: minLength<rule & number>
	maxLength: maxLength<rule & number>
	after: after<rule & string>
	before: before<rule & string>
	regex: regex<rule & string>
	length: length<rule & number>
	predicate: predicate
}