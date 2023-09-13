import { node } from "@arktype/schema"
import {
	wellFormedIntegerMatcher,
	wellFormedNumberMatcher
} from "@arktype/util"
import type { Out } from "../../parser/tuple.js"
import { Scope } from "../../scope.js"
import type { RootScope } from "../ark.js"
import { creditCard } from "./creditCard.js"
import { parsedDate } from "./date.js"

// Non-trivial expressions should have an explanation or attribution

const parsedNumber = node({
	basis: "string",
	pattern: wellFormedNumberMatcher,
	morph: (s: string) => parseFloat(s),
	description: "a well-formed numeric string"
})

const parsedInteger = node({
	basis: "string",
	pattern: wellFormedIntegerMatcher,
	morph: (s: string, problems) => {
		// if (!isWellFormedInteger(s)) {
		// 	return problems.mustBe("a well-formed integer string")
		// }
		// const parsed = parseInt(s)
		// return Number.isSafeInteger(parsed)
		// 	? parsed
		// 	: problems.mustBe(
		// 			"an integer in the range Number.MIN_SAFE_INTEGER to Number.MAX_SAFE_INTEGER"
		// 	  )
	}
})

// https://www.regular-expressions.info/email.html
const emailMatcher = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

const email = node({
	basis: "string",
	pattern: emailMatcher,
	description: "a valid email"
})

const uuidMatcher =
	/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

// https://github.com/validatorjs/validator.js/blob/master/src/lib/isUUID.js
// "a valid UUID"
const uuid = node({
	basis: "string",
	pattern: uuidMatcher,
	description: "a valid UUID"
})

const semverMatcher =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

// https://semver.org/
const semver = node({
	basis: "string",
	pattern: semverMatcher,
	description: "a valid semantic version (see https://semver.org/)"
})

const json = node({
	basis: "string",
	morph: (s: string) => JSON.parse(s),
	description: "a JSON-parsable string"
})

// "creditCard": "a valid credit card number",
// "parsedDate": "a valid date",

export type InferredValidation = {
	alpha: string
	alphanumeric: string
	lowercase: string
	uppercase: string
	creditCard: string
	email: string
	uuid: string
	parsedNumber: (In: string) => Out<number>
	parsedInteger: (In: string) => Out<number>
	parsedDate: (In: string) => Out<Date>
	semver: string
	json: (In: string) => Out<unknown>
	integer: number
}

export const validation: RootScope<InferredValidation> = Scope.root({
	// Character sets
	alpha: [/^[A-Za-z]*$/, "@", "only letters"],
	alphanumeric: [/^[A-Za-z\d]*$/, "@", "only letters and digits"],
	lowercase: [/^[a-z]*$/, "@", "only lowercase letters"],
	uppercase: [/^[A-Z]*$/, "@", "only uppercase letters"],
	creditCard,
	email,
	uuid,
	parsedNumber,
	parsedInteger,
	parsedDate,
	semver,
	json,
	integer: node({
		basis: "number",
		divisor: 1,
		description: "an integer"
	})
	// TODO: fix inference
}) as never

export const validationTypes = validation.export()