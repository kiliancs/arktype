import type { Dict, List, mutable } from "../utils/generics.js"
import { hasKeys, listFrom } from "../utils/generics.js"
import type {
    CompilationState,
    CompiledAssertion,
    DisjointsByPath
} from "./node.js"
import { DisjointNode, Node } from "./node.js"
import type { TypeNodeInput } from "./type.js"
import { getNever, TypeNode } from "./type.js"
import { insertUniversalPropAccess } from "./utils.js"

export class PropsNode extends Node<typeof PropsNode> {
    static readonly kind = "props"

    readonly named: PropsChild["named"]
    readonly indexed: PropsChild["indexed"]

    constructor(props: PropsChild) {
        super(PropsNode, props)
        this.named = props.named
        this.indexed = props.indexed
    }

    static from(input: PropsInput) {
        const named = {} as mutable<PropsChild["named"]>
        for (const k in input.named) {
            const namedPropDefinition = input.named[k]
            named[k] =
                namedPropDefinition instanceof NamedPropNode
                    ? namedPropDefinition
                    : NamedPropNode.from(namedPropDefinition)
        }
        const indexed: PropsChild["indexed"] = input.indexed.map(
            ([keyInput, valueInput]) => [
                keyInput instanceof TypeNode
                    ? keyInput
                    : TypeNode.from(...listFrom(keyInput)),
                valueInput instanceof TypeNode
                    ? valueInput
                    : TypeNode.from(...listFrom(valueInput))
            ]
        )
        const child: PropsChild = {
            named,
            indexed
        }
        return new PropsNode(child)
    }

    static compile(props: PropsChild) {
        const checks: string[] = []
        const names = Object.keys(props.named).sort()
        for (const k of names) {
            checks.push(insertUniversalPropAccess(props.named[k].key, k))
        }
        // TODO: empty? (same for others)
        return checks.join(" && ") as CompiledAssertion
    }

    compileTraverse(s: CompilationState) {
        return Object.keys(this.named)
            .sort()
            .map((k) =>
                insertUniversalPropAccess(this.named[k].compileTraverse(s), k)
            )
            .join("\n")
    }

    static intersect(l: PropsNode, r: PropsNode) {
        const indexed = [...l.indexed]
        for (const [rKey, rValue] of r.indexed) {
            const matchingIndex = indexed.findIndex(([lKey]) => lKey === rKey)
            if (matchingIndex === -1) {
                indexed.push([rKey, rValue])
            } else {
                // TODO: path updates here
                const result = indexed[matchingIndex][1].intersect(rValue)
                indexed[matchingIndex][1] =
                    result instanceof DisjointNode ? getNever() : result
            }
        }
        const named = { ...l.named, ...r.named }
        const disjointsByPath: DisjointsByPath = {}
        for (const k in named) {
            let propResult: NamedPropNode | DisjointNode = named[k]
            if (k in l.named) {
                if (k in r.named) {
                    // We assume l and r were properly created and the named
                    // props from each PropsNode have already been intersected
                    // with any matching index props. Therefore, the
                    // intersection result will already include index values
                    // from both sides whose key types allow k.
                    propResult = l.named[k].intersect(r.named[k])
                } else {
                    // If a named key from l matches any index keys of r, intersect
                    // the value associated with the name with the index value.
                    for (const [rKey, rValue] of r.indexed) {
                        if (rKey.allows(k)) {
                            const rValueAsProp = new NamedPropNode({
                                kind: "optional",
                                value: rValue
                            })
                            propResult = l.named[k].intersect(rValueAsProp)
                        }
                    }
                }
            } else {
                // If a named key from r matches any index keys of l, intersect
                // the value associated with the name with the index value.
                for (const [lKey, lValue] of l.indexed) {
                    if (lKey.allows(k)) {
                        const lValueAsProp = new NamedPropNode({
                            kind: "optional",
                            value: lValue
                        })
                        propResult = r.named[k].intersect(lValueAsProp)
                    }
                }
            }
            if (propResult instanceof DisjointNode) {
                Object.assign(
                    disjointsByPath,
                    propResult.withPrefixKey(k).paths
                )
            } else {
                named[k] = propResult
            }
        }
        return hasKeys(disjointsByPath)
            ? new DisjointNode(disjointsByPath)
            : new PropsNode({ named, indexed })
    }
}

export type PropValueInput = TypeNode | TypeNodeInput | TypeNodeInput[number]

export type PropsInput = {
    named: Dict<string, NamedPropNode | NamedPropInput>
    indexed: List<[keyType: PropValueInput, valueType: PropValueInput]>
}

export type PropsChild = {
    named: Dict<string, NamedPropNode>
    indexed: List<[keyType: TypeNode, valueType: TypeNode]>
}

export type PropKind = "required" | "optional" | "prerequisite"

export type NamedPropInput = {
    kind: PropKind
    value: PropValueInput
}

export type NamedPropChild = {
    kind: PropKind
    value: TypeNode
}

export class NamedPropNode extends Node<typeof NamedPropNode> {
    static readonly kind = "namedProp"

    constructor(public prop: NamedPropChild) {
        super(NamedPropNode, prop)
    }

    static from(input: NamedPropInput) {
        const child: NamedPropChild = {
            kind: input.kind,
            value:
                input.value instanceof TypeNode
                    ? input.value
                    : TypeNode.from(...listFrom(input.value))
        }
        return new NamedPropNode(child)
    }

    static compile(child: NamedPropChild) {
        // TODO: nested?
        return child.value.key
    }

    compileTraverse(s: CompilationState) {
        return this.prop.value.compileTraverse(s)
    }

    static intersect(
        l: NamedPropNode,
        r: NamedPropNode
    ): NamedPropNode | DisjointNode {
        const kind =
            l.prop.kind === "prerequisite" || r.prop.kind === "prerequisite"
                ? "prerequisite"
                : l.prop.kind === "required" || r.prop.kind === "required"
                ? "required"
                : "optional"
        const result = l.prop.value.intersect(r.prop.value)
        if (result instanceof DisjointNode) {
            if (kind === "optional") {
                return new NamedPropNode({
                    kind,
                    value: getNever()
                })
            }
            return result
        }
        return new NamedPropNode({
            kind,
            value: result
        })
    }
}

// const keysOfPredicate = (kind: Domain, predicate: Predicate) =>
//     domain !== "object" || predicate === true
//         ? baseKeysByDomain[domain]
//         : sharedKeysOf(
//               listFrom(predicate).map((branch) => keysOfObjectBranch(branch))
//           )

// const sharedKeysOf = (keyBranches: List<KeyValue>[]): List<KeyValue> => {
//     if (!keyBranches.length) {
//         return []
//     }
//     let sharedKeys = keyBranches[0]
//     for (let i = 1; i < keyBranches.length; i++) {
//         // we can filter directly by equality here because the RegExp we're
//         // using will always be reference equal to
//         // wellFormedNonNegativeIntegerMatcher
//         sharedKeys = sharedKeys.filter((k) => keyBranches[i].includes(k))
//     }
//     return sharedKeys
// }

// const keysOfObjectBranch = (branch: BranchDefinition<"object">): KeyValue[] => {
//     const result: KeyValue[] = []
//     if ("props" in branch) {
//         for (const key of Object.keys(branch.props)) {
//             if (key === mappedKeys.index) {
//                 // if any number is a valid key push this RegExp
//                 result.push(wellFormedNonNegativeIntegerMatcher)
//             } else if (!result.includes(key)) {
//                 result.push(key)
//                 if (wellFormedNonNegativeIntegerMatcher.test(key)) {
//                     // allow numeric access to keys
//                     result.push(
//                         tryParseWellFormedInteger(
//                             key,
//                             `Unexpectedly failed to parse an integer from key '${key}'`
//                         )
//                     )
//                 }
//             }
//         }
//     }
//     if ("instance" in branch) {
//         for (const key of prototypeKeysOf(branch.instance.prototype)) {
//             if (!result.includes(key)) {
//                 result.push(key)
//             }
//         }
//     }
//     return result
// }
