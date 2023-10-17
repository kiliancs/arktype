/* eslint-disable @typescript-eslint/no-restricted-imports */
import { type } from "arktype"
import type {
	BaseAttributes,
	IntersectionSchema,
	Morph,
	MorphSchema,
	TraversalState,
	TypeNode
} from "./ark/schema/main.js"
import { node } from "./ark/schema/main.js"

const compileType = (node: TypeNode) => {
	switch (node.kind) {
		case "union":
			return "throw Error('unsupported')"
		case "morph":
			return "throw Error('unsupported')"
		case "intersection":
			return node.description
	}
}

const n = node({
	domain: "string"
})

n //?

const result = compileType(n) //?
