import type { Dict, List } from "../utils/generics.ts"
import type { ComparisonState, CompilationState } from "./node.ts"
import { Disjoint, Node } from "./node.ts"
import { never, TypeNode } from "./type.ts"

export class PropsNode extends Node<typeof PropsNode> {
    readonly named: PropsRule["named"]
    readonly indexed: PropsRule["indexed"]

    constructor(rule: PropsRule) {
        super(PropsNode, rule)
        this.named = rule.named
        this.indexed = rule.indexed
    }

    static compile(rule: PropsRule, s: CompilationState) {
        const propChecks: string[] = []
        // // if we don't care about extraneous keys, compile props so we can iterate over the definitions directly
        // for (const k in named) {
        //     const prop = named[k]
        //     c.path.push(k)
        //     propChecks.push(prop.type.compile(c))
        //     c.path.pop()
        // }
        return propChecks.length ? s.mergeChecks(propChecks) : "true"
    }

    static intersection(l: PropsNode, r: PropsNode, s: ComparisonState) {
        const indexed = [...l.indexed]
        for (const [rKey, rValue] of r.indexed) {
            const matchingIndex = indexed.findIndex(([lKey]) => lKey === rKey)
            if (matchingIndex === -1) {
                indexed.push([rKey, rValue])
            } else {
                // TODO: path updates here
                const result = TypeNode.intersection(
                    indexed[matchingIndex][1],
                    rValue,
                    s
                )
                indexed[matchingIndex][1] =
                    result instanceof Disjoint ? never : result
            }
        }
        const named = { ...l.named, ...r.named }
        for (const k in named) {
            let propResult = named[k]
            if (k in l) {
                if (k in r) {
                    // We assume l and r were properly created and the named
                    // props from each PropsNode have already been intersected
                    // with any matching index props. Therefore, the
                    // intersection result will already include index values
                    // from both sides whose key types allow k.
                    const result = NamedPropNode.intersection(
                        l.named[k],
                        r.named[k],
                        s
                    )
                    if (result instanceof Disjoint) {
                        return result
                    }
                    propResult = result
                } else {
                    // If a named key from l matches any index keys of r, intersect
                    // the value associated with the name with the index value.
                    for (const [rKey, rValue] of r.indexed) {
                        if (rKey(k)) {
                            const rValueAsProp = new NamedPropNode({
                                kind: "optional",
                                value: rValue
                            })
                            const result = NamedPropNode.intersection(
                                propResult,
                                rValueAsProp,
                                s
                            )
                            if (result instanceof Disjoint) {
                                return result
                            }
                            propResult = result
                        }
                    }
                }
            } else {
                // If a named key from r matches any index keys of l, intersect
                // the value associated with the name with the index value.
                for (const [lKey, lValue] of l.indexed) {
                    if (lKey(k)) {
                        const lValueAsProp = new NamedPropNode({
                            kind: "optional",
                            value: lValue
                        })
                        const result = NamedPropNode.intersection(
                            propResult,
                            lValueAsProp,
                            s
                        )
                        if (result instanceof Disjoint) {
                            return result
                        }
                        propResult = result
                    }
                }
            }
            named[k] = propResult
        }
        return new PropsNode({ named, indexed })
    }
}

export type PropsRule = {
    named: Dict<string, NamedPropNode>
    indexed: List<[keyType: TypeNode, valueType: TypeNode]>
}

export type PropsDefinition = {
    named: Dict<string, NamedPropDefinition>
    indexed: List<[keyType: unknown, valueType: unknown]>
}

export type PropKind = "required" | "optional" | "prerequisite"

export type NamedPropDefinition = {
    kind: PropKind
    value: unknown
}

// TODO: attach these to class instead pass and infer as variadic args
export type NamedPropRule = {
    kind: PropKind
    value: TypeNode
}

export class NamedPropNode extends Node<typeof NamedPropNode> {
    constructor(rule: NamedPropRule) {
        super(NamedPropNode, rule)
    }

    static compile(rule: NamedPropRule, s: CompilationState) {
        return rule.value.compile(s)
    }

    static intersection(
        l: NamedPropNode,
        r: NamedPropNode,
        s: ComparisonState
    ): NamedPropNode | Disjoint {
        const kind =
            l.rule.kind === "prerequisite" || r.rule.kind === "prerequisite"
                ? "prerequisite"
                : l.rule.kind === "required" || r.rule.kind === "required"
                ? "required"
                : "optional"
        const result = TypeNode.intersection(l.rule.value, r.rule.value, s)
        return result instanceof Disjoint
            ? kind === "optional"
                ? new NamedPropNode({
                      kind,
                      value: never
                  })
                : result
            : new NamedPropNode({
                  kind,
                  value: result
              })
    }
}