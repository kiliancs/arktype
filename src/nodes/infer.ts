import type { inferTerminal } from "../parse/ast/ast.js"
import type { Out } from "../parse/ast/morph.js"
import type { Domain, inferDomain } from "../utils/domains.js"
import type {
    constructor,
    evaluate,
    evaluateObjectOrFunction,
    HomogenousTuple,
    List,
    returnOf
} from "../utils/generics.js"
import type {
    BuiltinClass,
    DefaultObjectKind,
    inferObjectKind
} from "../utils/objectKinds.js"
import type { MorphBranch } from "./branch.js"
import type { LiteralNode, ResolvedNode, TypeNode } from "./node.js"
import type { Predicate } from "./predicate.js"
import type {
    MappedPropKey,
    OptionalProp,
    Prop,
    PropsRule
} from "./rules/props.js"
import type { LiteralRules, NarrowableRules } from "./rules/rules.js"

export type inferNode<node extends TypeNode<$>, $ = {}> = node extends string
    ? inferTerminal<node, $>
    : node extends ResolvedNode<$>
    ? inferResolution<node, $> extends infer result
        ? result extends BuiltinClass
            ? // don't evaluate builtin classes like Date (expanding their prototype looks like a mess)
              result
            : evaluateObjectOrFunction<result>
        : never
    : never

export type inferResolution<node extends ResolvedNode<$>, $> = {
    [domain in keyof node]: inferPredicate<
        // @ts-expect-error Some very odd inference behavior related to domain I can't resolve
        domain,
        node[domain],
        $
    >
}[keyof node]

type inferPredicate<
    domain extends Domain,
    predicate extends Predicate,
    $
> = predicate extends true
    ? inferDomain<domain>
    : inferBranch<domain, branchFrom<predicate>, $>

type branchFrom<predicate extends Predicate> = predicate extends List
    ? predicate[number]
    : predicate

type inferBranch<domain extends Domain, branch, $> = branch extends MorphBranch
    ? inferMorph<domain, branch, $>
    : inferRules<domain, branch, $>

type inferMorph<domain extends Domain, branch extends MorphBranch, $> = (
    In: inferBranch<domain, branch["rules"], $>
) => Out<
    branch["morph"] extends [...unknown[], infer tail]
        ? returnOf<tail>
        : returnOf<branch["morph"]>
>

type inferRules<domain extends Domain, branch, $> = branch extends LiteralRules
    ? branch["value"]
    : domain extends "object"
    ? branch extends NarrowableRules
        ? inferObjectRules<branch, $>
        : object
    : inferDomain<domain>

type inferObjectRules<
    rules extends NarrowableRules,
    $
> = rules["class"] extends DefaultObjectKind
    ? [rules["class"], rules["props"]] extends [
          "Array",
          {
              "[index]": Prop<$, infer indexNode>
              length?: Prop<$, infer lengthNode>
          }
      ]
        ? lengthNode extends LiteralNode<"number", infer value>
            ? HomogenousTuple<inferNode<indexNode, $>, value>
            : inferNode<indexNode, $>[]
        : inferObjectKind<rules["class"]>
    : rules["class"] extends constructor<infer instance>
    ? instance
    : rules["props"] extends PropsRule
    ? inferProps<rules["props"], $>
    : object

type inferProps<props extends PropsRule, $> = evaluate<
    {
        [k in requiredKeyOf<props>]: props[k] extends Prop<$, infer node>
            ? inferNode<node, $>
            : never
    } & {
        [k in optionalKeyOf<props>]?: props[k] extends OptionalProp<$>
            ? inferNode<props[k][1], $>
            : never
    }
>

type optionalKeyOf<props extends PropsRule> = {
    [k in keyof props]: props[k] extends OptionalProp ? k : never
}[keyof props]

type mappedKeyOf<props extends PropsRule> = Extract<keyof props, MappedPropKey>

type requiredKeyOf<props extends PropsRule> = Exclude<
    keyof props,
    optionalKeyOf<props> | mappedKeyOf<props>
>