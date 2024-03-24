import { attest } from "@arktype/attest"
import {
	entriesOf,
	morph,
	writeMalformedNumericLiteralMessage
} from "@arktype/util"
import { type } from "arktype"
import {
	boundKindPairsByLower,
	writeUnboundableMessage
} from "../constraints/refinements/range.js"
import { node } from "../keywords/ark.js"
import { writeDoubleRightBoundMessage } from "../parser/semantic/bounds.js"
import {
	writeMultipleLeftBoundsMessage,
	writeOpenRangeMessage,
	writeUnpairableComparatorMessage
} from "../parser/string/reduce/shared.js"
import {
	singleEqualsMessage,
	writeInvalidLimitMessage
} from "../parser/string/shift/operator/bounds.js"
import { Disjoint } from "../shared/disjoint.js"
import type { IntersectionSchema } from "../types/intersection.js"

describe("bounds", () => {
	describe("parse", () => {
		it(">", () => {
			const t = type("number>0")
			attest<number>(t.infer)
			attest(t.json).snap({
				domain: "number",
				min: { exclusive: true, rule: 0 }
			})
		})
		it("<", () => {
			const t = type("number<10")
			attest<number>(t.infer)
			const expected = node({
				domain: "number",
				max: { rule: 10, exclusive: true }
			})
			attest(t.json).equals(expected.json)
		})
		it("<=", () => {
			const t = type("number<=-49")
			attest<number>(t.infer)
			const expected = node({
				domain: "number",
				max: { rule: -49, exclusive: false }
			})
			attest(t.json).equals(expected.json)
		})
		it("==", () => {
			const t = type("number==3211993")
			attest<number>(t.infer)
			const expected = node({ unit: 3211993 })
			attest(t.json).equals(expected.json)
		})
		it("<,<=", () => {
			const t = type("-5<number<=5")
			attest<number>(t.infer)
			const expected = node({
				domain: "number",
				min: { rule: -5, exclusive: true },
				max: 5
			})
			attest(t.json).equals(expected.json)
		})
		it("<=,<", () => {
			const t = type("-3.23<=number<4.654")
			attest<number>(t.infer)
			const expected = node({
				domain: "number",
				min: { rule: -3.23 },
				max: { rule: 4.654, exclusive: true }
			})
			attest(t.json).equals(expected.json)
		})
		it("whitespace following comparator", () => {
			const t = type("number > 3")
			attest<number>(t.infer)
			const expected = node({
				domain: "number",
				min: { rule: 3, exclusive: true }
			})
			attest(t.json).equals(expected.json)
		})

		// it("single", () => {
		// 	const t = type("Date<d'2023/1/12'")
		// 	attest<Date>(t.infer)
		// 	attest(t.json).equals(
		// 		// TODO: Dates?
		// 		expectedDateBoundsCondition({
		// 			limitKind: "max",
		// 			exclusive: true,
		// 			limit: new Date("2023/1/12").valueOf()
		// 		})
		// 	)
		// })
		// it("equality", () => {
		// 	const t = type("Date==d'2020-1-1'")
		// 	attest<Date>(t.infer)
		// 	attest(t.json).equals(
		// 		expectedDateBoundsCondition(
		// 			{
		// 				limitKind: "min",
		// 				exclusive: false,
		// 				limit: new Date("2020-1-1").valueOf()
		// 			},
		// 			{
		// 				limitKind: "max",
		// 				exclusive: false,
		// 				limit: new Date("2020-1-1").valueOf()
		// 			}
		// 		)
		// 	)
		// 	attest(t.allows(new Date("2020/01/01"))).equals(true)
		// 	attest(t.allows(new Date("2020/01/02"))).equals(false)
		// })
		// it("double", () => {
		// 	const t = type("d'2001/10/10'<Date<d'2005/10/10'")
		// 	attest<Date>(t.infer)
		// 	attest(t.json).equals(
		// 		expectedDateBoundsCondition(
		// 			{
		// 				limitKind: "min",
		// 				exclusive: true,
		// 				limit: new Date("2001/10/10").valueOf()
		// 			},
		// 			{
		// 				limitKind: "max",
		// 				exclusive: true,
		// 				limit: new Date("2005/10/10").valueOf()
		// 			}
		// 		)
		// 	)
		// 	attest(t.allows(new Date("2003/10/10"))).equals(true)
		// 	attest(t.allows(new Date("2001/10/10"))).equals(false)
		// 	attest(t.allows(new Date("2005/10/10"))).equals(false)
		// })
		it("dynamic", () => {
			const now = new Date()
			const t = type(`d'2000'<Date<=d'${now.toISOString()}'`)
			attest<Date>(t.infer)
			attest(t.allows(new Date(now.valueOf() - 1000))).equals(true)
			attest(t.allows(now)).equals(true)
			attest(t.allows(new Date(now.valueOf() + 1000))).equals(false)
		})

		it("single equals", () => {
			// @ts-expect-error
			attest(() => type("string=5")).throwsAndHasTypeError(singleEqualsMessage)
		})
		it("invalid left comparator", () => {
			// @ts-expect-error
			attest(() => type("3>number<5")).throwsAndHasTypeError(
				writeUnpairableComparatorMessage(">")
			)
		})
		it("invalid right double-bound comparator", () => {
			// @ts-expect-error
			attest(() => type("3<number==5")).throwsAndHasTypeError(
				writeUnpairableComparatorMessage("==")
			)
		})
		it("unpaired left", () => {
			// @ts-expect-error temporarily disabled type snapshot as it is returning ''
			attest(() => type("3<number")).throws(writeOpenRangeMessage(3, ">"))
		})
		it("unpaired left group", () => {
			// @ts-expect-error
			attest(() => type("(-1<=number)")).throws(writeOpenRangeMessage(-1, ">="))
		})
		it("double left", () => {
			// @ts-expect-error
			attest(() => type("3<5<8")).throwsAndHasTypeError(
				writeMultipleLeftBoundsMessage(3, ">", 5, ">")
			)
		})
		it("empty range", () => {
			attest(() => type("3<=number<2")).throws.snap(
				"ParseError: Intersection of <2 and >=3 results in an unsatisfiable type"
			)
		})
		it("double right bound", () => {
			// @ts-expect-error
			attest(() => type("number>0<=200")).type.errors(
				writeDoubleRightBoundMessage("number")
			)
		})
		it("non-narrowed bounds", () => {
			const a = 5 as number
			const b = 7 as number
			const t = type(`${a}<number<${b}`)
			attest<number>(t.infer)
		})
		it("fails at runtime on malformed right", () => {
			attest(() => type("number<07")).throws(
				writeMalformedNumericLiteralMessage("07", "number")
			)
		})
		it("fails at runtime on malformed lower", () => {
			attest(() => type("3.0<number<5")).throws(
				writeMalformedNumericLiteralMessage("3.0", "number")
			)
		})

		it("number", () => {
			attest<number>(type("number==-3.14159").infer)
		})
		it("string", () => {
			attest<string>(type("string<=5").infer)
		})
		it("array", () => {
			attest<boolean[]>(type("87<=boolean[]<89").infer)
		})
		it("multiple bound kinds", () => {
			attest(() =>
				// @ts-expect-error
				type("(number | string | boolean[])>0")
			).throwsAndHasTypeError(
				writeUnboundableMessage("number | string | boolean[]")
			)
		})

		it("unknown", () => {
			// @ts-expect-error
			attest(() => type("unknown<10")).throwsAndHasTypeError(
				writeUnboundableMessage("unknown")
			)
		})
		it("unboundable", () => {
			// @ts-expect-error
			attest(() => type("object>10")).throwsAndHasTypeError(
				writeUnboundableMessage("object")
			)
		})
		it("same bound kind union", () => {
			const t = type("1<(number[]|object[])<10")
			attest<number[] | object[]>(t.infer)
			const expected = type("1<number[]<10 | 1<object[]<10")
			attest(t.json).equals(expected.json)
		})

		it("number with right Date bound", () => {
			attest(() =>
				// @ts-expect-error
				type("number<d'2001/01/01'")
			).throwsAndHasTypeError(
				writeInvalidLimitMessage("<", "d'2001/01/01'", "right")
			)
		})
		it("number with left Date bound", () => {
			// @ts-expect-error
			attest(() => type("d'2001/01/01'<number<2")).throwsAndHasTypeError(
				writeInvalidLimitMessage(">", "d'2001/01/01'", "left")
			)
		})
	})

	describe("constrain", () => {
		it("min", () => {
			const t = type("number").constrain("min", 5)
			const expected = type("number>=5")
			attest<typeof expected>(t)
			attest(t.json).equals(expected.json)
		})
		it("max", () => {
			const t = type("number").constrain("max", 10)
			const expected = type("number<=10")
			attest<typeof expected>(t)
			attest(t.json).equals(expected.json)
		})

		it("minLength", () => {
			const t = type("string").constrain("minLength", 5)
			const expected = type("string>=5")
			attest<typeof expected>(t)
			attest(t.json).equals(expected.json)
		})

		it("maxLength", () => {
			const t = type("string").constrain("maxLength", 10)
			const expected = type("string<=10")
			attest<typeof expected>(t)
			attest(t.json).equals(expected.json)
		})

		// TODO:  reenable
		// it("chained after", () => {
		// 	const t = type("Date").after(new Date(2022, 0, 1))
		// 	// widen the input to a string so both are non-narrowed
		// 	const expected = type(`Date>=d'${"2022-01-01" as string}'`)
		// 	attest<typeof expected>(t)
		// 	attest(t.json).equals(expected.json)
		// })

		// it("chained before", () => {
		// 	const t = type("Date").before(5)
		// 	const expected = type("Date<=5")
		// 	attest<typeof expected>(t)
		// 	attest(t.json).equals(expected.json)
		// })

		it("exclusive", () => {
			const t = type("number").constrain("min", { rule: 1337, exclusive: true })
			const expected = type("number>1337")
			attest<typeof expected>(t)
			attest(t.json).equals(expected.json)
		})
	})

	const numericCases = {
		lessThanMin: 4,
		equalToExclusiveMin: 5,
		between: 8,
		equalToInclusiveMax: 10,
		greaterThanMax: 11
	}

	const dateCases = morph(numericCases, (name, v) => [name, new Date(v)])

	const lengthCases = morph(numericCases, (name, v) => [name, "1".repeat(v)])

	describe("invoke", () => {
		it("numeric apply", () => {
			const t = node({
				domain: "number",
				min: { rule: 5, exclusive: true },
				max: { rule: 10 }
			})

			attest(t(numericCases.lessThanMin).errors?.summary).snap(
				"must be more than 5 (was 4)"
			)
			attest(t(numericCases.equalToExclusiveMin).errors?.summary).snap(
				"must be more than 5 (was 5)"
			)
			attest(t(numericCases.between).errors).equals(undefined)
			attest(t(numericCases.equalToInclusiveMax).errors).equals(undefined)
			attest(t(numericCases.greaterThanMax).errors?.summary).snap(
				"must be at most 10 (was 11)"
			)
		})
		it("length apply", () => {
			const t = node({
				domain: "string",
				minLength: { rule: 5, exclusive: true },
				maxLength: { rule: 10 }
			})

			attest(t(lengthCases.lessThanMin).errors?.summary).snap(
				"must be more than length 5 (was 4)"
			)
			attest(t(lengthCases.equalToExclusiveMin).errors?.summary).snap(
				"must be more than length 5 (was 5)"
			)
			attest(t(lengthCases.between).errors).equals(undefined)
			attest(t(lengthCases.equalToInclusiveMax).errors).equals(undefined)
			attest(t(lengthCases.greaterThanMax).errors?.summary).snap(
				"must be at most length 10 (was 11)"
			)
		})
		it("date apply", () => {
			const t = node({
				proto: Date,
				after: { rule: 5, exclusive: true },
				before: { rule: 10 }
			})

			attest(t(dateCases.lessThanMin).errors?.summary).snap(
				"must be after 12/31/1969, 7:00:00 PM (was 12/31/1969, 7:00:00 PM)"
			)
			attest(t(dateCases.equalToExclusiveMin).errors?.summary).snap(
				"must be after 12/31/1969, 7:00:00 PM (was 12/31/1969, 7:00:00 PM)"
			)
			attest(t(dateCases.between).errors).equals(undefined)
			attest(t(dateCases.equalToInclusiveMax).errors).equals(undefined)
			attest(t(dateCases.greaterThanMax).errors?.summary).snap(
				"must be 12/31/1969, 7:00:00 PM or earlier (was 12/31/1969, 7:00:00 PM)"
			)
		})

		entriesOf(boundKindPairsByLower).forEach(([min, max]) => {
			describe(`${min}/${max}`, () => {
				const basis =
					min === "min"
						? { domain: "number" }
						: min === "minLength"
						? { domain: "string" }
						: { proto: Date }
				const cases =
					min === "min"
						? numericCases
						: min === "minLength"
						? lengthCases
						: dateCases
				it("allows", () => {
					const t = node({
						...basis,
						[min]: { rule: 5, exclusive: true },
						[max]: { rule: 10 }
					} as IntersectionSchema)

					attest(t.allows(cases.lessThanMin)).equals(false)
					attest(t.allows(cases.equalToExclusiveMin)).equals(false)
					attest(t.allows(cases.between)).equals(true)
					attest(t.allows(cases.equalToInclusiveMax)).equals(true)
					attest(t.allows(cases.greaterThanMax)).equals(false)
				})
				it("unit range reduces", () => {
					const l = node({
						...basis,
						[min]: {
							rule: 6
						}
					} as IntersectionSchema)
					const r = node({
						...basis,
						[max]: {
							rule: 6
						}
					} as IntersectionSchema)
					const expected =
						min === "min"
							? node({
									unit: 6
							  })
							: min === "minLength"
							? node({
									...basis,
									exactLength: 6
							  } as IntersectionSchema)
							: node({
									unit: new Date(6)
							  })

					attest(l.and(r).json).equals(expected.json)
					attest(r.and(l).json).equals(expected.json)
				})
				it("non-overlapping exclusive", () => {
					const l = node({
						...basis,
						[min]: {
							rule: 3
						}
					} as IntersectionSchema)
					const r = node({
						...basis,
						[max]: {
							rule: 3,
							exclusive: true
						}
					} as IntersectionSchema)
					attest(l.intersect(r)).instanceOf(Disjoint)
					attest(r.intersect(l)).instanceOf(Disjoint)
				})
				it("non-overlapping limits", () => {
					const l = node({ ...basis, [min]: 3 } as IntersectionSchema)
					const r = node({
						...basis,
						[max]: 1
					} as IntersectionSchema)
					attest(l.intersect(r)).instanceOf(Disjoint)
					attest(r.intersect(l)).instanceOf(Disjoint)
				})
				it("greater min is stricter", () => {
					const lesser = node({ ...basis, [min]: 3 } as IntersectionSchema)
					const greater = node({
						...basis,
						[min]: 4
					} as IntersectionSchema)
					attest(lesser.and(greater).json).equals(greater.json)
					attest(greater.and(lesser).json).equals(greater.json)
				})
				it("lesser max is stricter", () => {
					const lesser = node({ ...basis, [max]: 3 } as IntersectionSchema)
					const greater = node({
						...basis,
						[max]: { rule: 4, exclusive: true }
					} as IntersectionSchema)
					attest(lesser.and(greater).json).equals(lesser.json)
					attest(greater.and(lesser).json).equals(lesser.json)
				})
				it("exclusive wins if limits equal", () => {
					const exclusive = node({
						...basis,
						[max]: { rule: 3, exclusive: true }
					} as IntersectionSchema)
					const inclusive = node({
						...basis,
						[max]: 3
					} as IntersectionSchema)
					attest(exclusive.and(inclusive).json).equals(exclusive.json)
					attest(inclusive.and(exclusive).json).equals(exclusive.json)
				})
			})
		})
	})
})
