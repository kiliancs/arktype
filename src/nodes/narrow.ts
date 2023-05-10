import type { Narrow } from "../parse/ast/narrow.js"
import type { listable } from "../utils/lists.js"
import { intersectUniqueLists, listFrom } from "../utils/lists.js"
import type { CompilationState } from "./compilation.js"
import { Node } from "./node.js"

export class NarrowNode extends Node<"narrow"> {
    static readonly kind = "narrow"
    predicates: readonly Narrow[]

    constructor(predicates: listable<Narrow>) {
        const predicateList = listFrom(predicates)
        super(NarrowNode, predicateList)
        this.predicates = predicateList
    }

    static compile(predicates: readonly Narrow[]) {
        return "false"
    }

    toString() {
        const names = this.predicates.map((f) => f.name)
        return names.length === 1
            ? `narrow ${names[0]}`
            : `narrows ${names.join(", ")}`
    }

    compileTraverse(s: CompilationState) {
        return s.ifNotThen(this.condition, s.problem("custom", "filters"))
    }

    static intersect(l: NarrowNode, r: NarrowNode) {
        return new NarrowNode(intersectUniqueLists(l.predicates, r.predicates))
    }
}
