export const rangeKinds = [
	"min",
	"max",
	"minLength",
	"maxLength",
	"after",
	"before"
] as const

export type RangeKind = (typeof rangeKinds)[number]

export const boundKinds = [...rangeKinds, "exactLength"] as const

export type BoundKind = (typeof boundKinds)[number]
