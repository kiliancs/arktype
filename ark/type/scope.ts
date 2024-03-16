import {
	CompiledFunction,
	domainOf,
	hasDomain,
	isArray,
	isThunk,
	morph,
	throwInternalError,
	throwParseError,
	type Dict,
	type Json,
	type List,
	type evaluate,
	type isAny,
	type nominal,
	type requireKeys
} from "@arktype/util"
import { isNode, typeKindOfSchema, type UnknownNode } from "./base.js"
import { globalConfig } from "./config.js"
import type { type } from "./keywords/ark.js"
import type { jsObjectKeywords } from "./keywords/jsObject.js"
import type { tsPrimitiveKeywords } from "./keywords/tsPrimitive.js"
import { nodesByKind } from "./kinds.js"
import { createMatchParser, type MatchParser } from "./match.js"
import { parseAttachments, type SchemaParseOptions } from "./parse.js"
import {
	parseObject,
	writeBadDefinitionTypeMessage,
	type inferDefinition,
	type validateDefinition
} from "./parser/definition.js"
import {
	parseGenericParams,
	type GenericDeclaration,
	type GenericParamsParseError
} from "./parser/generic.js"
import { DynamicState } from "./parser/string/reduce/dynamic.js"
import {
	writeMissingSubmoduleAccessMessage,
	writeNonSubmoduleDotMessage,
	writeUnresolvableMessage
} from "./parser/string/shift/operand/unenclosed.js"
import { fullStringParse } from "./parser/string/string.js"
import type { NodeParser, SchemaParser } from "./schema.js"
import { NodeCompiler } from "./shared/compile.js"
import type { TraverseAllows, TraverseApply } from "./shared/context.js"
import type {
	ActualWriter,
	ArkErrorCode,
	ExpectedWriter,
	MessageWriter,
	ProblemWriter
} from "./shared/errors.js"
import {
	isNodeKind,
	type DescriptionWriter,
	type NodeKind,
	type TypeKind
} from "./shared/implement.js"
import {
	createTypeParser,
	generic,
	validateUninstantiatedGeneric,
	type DeclarationParser,
	type DefinitionParser,
	type Generic,
	type GenericProps,
	type TypeParser
} from "./type.js"
import type { extractIn, extractOut } from "./types/morph.js"
import { BaseType, type Type } from "./types/type.js"
import type { UnionNode } from "./types/union.js"
import type { UnitNode } from "./types/unit.js"
import { addArkKind, hasArkKind, type arkKind } from "./util.js"

export type nodeResolutions<keywords> = { [k in keyof keywords]: Type }

export type BaseResolutions = Record<string, Type>

declare global {
	export interface StaticArkConfig {
		preserve(): never
	}
}

type nodeConfigForKind<kind extends NodeKind> = evaluate<
	{
		description?: DescriptionWriter<kind>
	} & (kind extends ArkErrorCode
		? {
				expected?: ExpectedWriter<kind>
				actual?: ActualWriter<kind>
				problem?: ProblemWriter<kind>
				message?: MessageWriter<kind>
		  }
		: {})
>

type NodeConfigsByKind = {
	[kind in NodeKind]: nodeConfigForKind<kind>
}

export type NodeConfig<kind extends NodeKind = NodeKind> =
	NodeConfigsByKind[kind]

type UnknownNodeConfig = {
	description?: DescriptionWriter
	expected?: ExpectedWriter
	actual?: ActualWriter
	problem?: ProblemWriter
	message?: MessageWriter
}

export type ParsedUnknownNodeConfig = requireKeys<
	UnknownNodeConfig,
	"description"
>

export type StaticArkOption<k extends keyof StaticArkConfig> = ReturnType<
	StaticArkConfig[k]
>

export interface ArkConfig extends Partial<NodeConfigsByKind> {
	ambient?: Scope | null
	/** @internal */
	prereducedAliases?: boolean
	/** @internal */
	registerKeywords?: boolean
}

type resolveConfig<config extends ArkConfig> = {
	[k in keyof config]-?: k extends NodeKind ? Required<config[k]> : config[k]
}

export type ResolvedArkConfig = resolveConfig<ArkConfig>

const parseConfig = (scopeConfig: ArkConfig | undefined): ResolvedArkConfig => {
	if (!scopeConfig) {
		return globalConfig
	}
	const parsedConfig = { ...globalConfig }
	let k: keyof ArkConfig
	for (k in scopeConfig) {
		if (isNodeKind(k)) {
			parsedConfig[k] = {
				...nodesByKind[k].implementation.defaults,
				...scopeConfig[k]
			} as never
		} else {
			parsedConfig[k] = scopeConfig[k]! as never
		}
	}
	return parsedConfig
}

export type ScopeParser<parent, ambient> = {
	<const def>(
		def: validateScope<def, parent & ambient>,
		config?: ArkConfig
	): Scope<{
		exports: inferBootstrapped<{
			exports: bootstrapExports<def>
			locals: bootstrapLocals<def> & parent
			ambient: ambient
		}>
		locals: inferBootstrapped<{
			exports: bootstrapLocals<def>
			locals: bootstrapExports<def> & parent
			ambient: ambient
		}>
		ambient: ambient
	}>
}

type validateScope<def, $> = {
	[k in keyof def]: parseScopeKey<k>["params"] extends []
		? // Not including Type here directly breaks inference
		  def[k] extends Type | PreparsedResolution
			? def[k]
			: validateDefinition<def[k], $ & bootstrap<def>, {}>
		: parseScopeKey<k>["params"] extends GenericParamsParseError
		? // use the full nominal type here to avoid an overlap between the
		  // error message and a possible value for the property
		  parseScopeKey<k>["params"][0]
		: validateDefinition<
				def[k],
				$ & bootstrap<def>,
				{
					// once we support constraints on generic parameters, we'd use
					// the base type here: https://github.com/arktypeio/arktype/issues/796
					[param in parseScopeKey<k>["params"][number]]: unknown
				}
		  >
}

export type bindThis<def> = { this: Def<def> }

/** nominal type for an unparsed definition used during scope bootstrapping */
type Def<def = {}> = nominal<def, "unparsed">

/** sentinel indicating a scope that will be associated with a generic has not yet been parsed */
export type UnparsedScope = "$"

type bootstrap<def> = bootstrapLocals<def> & bootstrapExports<def>

type bootstrapLocals<def> = bootstrapAliases<{
	// intersection seems redundant but it is more efficient for TS to avoid
	// mapping all the keys
	[k in keyof def & PrivateDeclaration as extractPrivateKey<k>]: def[k]
}>

type bootstrapExports<def> = bootstrapAliases<{
	[k in Exclude<keyof def, PrivateDeclaration>]: def[k]
}>

/** These are legal as values of a scope but not as definitions in other contexts */
type PreparsedResolution = Module | GenericProps

type bootstrapAliases<def> = {
	[k in Exclude<
		keyof def,
		// avoid inferring nominal symbols, e.g. arkKind from Module
		GenericDeclaration | symbol
	>]: def[k] extends PreparsedResolution
		? def[k]
		: def[k] extends (() => infer thunkReturn extends PreparsedResolution)
		? thunkReturn
		: Def<def[k]>
} & {
	[k in keyof def & GenericDeclaration as extractGenericName<k>]: Generic<
		parseGenericParams<extractGenericParameters<k>>,
		def[k],
		UnparsedScope
	>
}

type inferBootstrapped<r extends Resolutions> = evaluate<{
	[name in keyof r["exports"]]: r["exports"][name] extends Def<infer def>
		? inferDefinition<def, $<r>, {}>
		: r["exports"][name] extends GenericProps<infer params, infer def>
		? // add the scope in which the generic was defined here
		  Generic<params, def, $<r>>
		: // otherwise should be a submodule
		  r["exports"][name]
}>

type extractGenericName<k> = k extends GenericDeclaration<infer name>
	? name
	: never

type extractGenericParameters<k> = k extends GenericDeclaration<
	string,
	infer params
>
	? params
	: never

type extractPrivateKey<k> = k extends PrivateDeclaration<infer key>
	? key
	: never

type PrivateDeclaration<key extends string = string> = `#${key}`

export type resolve<reference extends keyof $ | keyof args, $, args> = (
	reference extends keyof args ? args[reference] : $[reference & keyof $]
) extends infer resolution
	? [resolution] extends [never]
		? never
		: isAny<resolution> extends true
		? any
		: resolution extends Def<infer def>
		? inferDefinition<def, $, args>
		: resolution
	: never

export type moduleKeyOf<$> = {
	[k in keyof $]: $[k] extends Module ? k & string : never
}[keyof $]

export type tryInferSubmoduleReference<$, token> =
	token extends `${infer submodule extends moduleKeyOf<$>}.${infer subalias}`
		? subalias extends keyof $[submodule]
			? $[submodule][subalias] extends Type<infer t>
				? t
				: never
			: never
		: never

type $<r extends Resolutions> = r["exports"] & r["locals"] & r["ambient"]

type exportedName<r extends Resolutions> = keyof r["exports"] & string

export type Module<r extends Resolutions = any> = {
	// just adding the nominal id this way and mapping it is cheaper than an intersection
	[k in exportedName<r> | arkKind]: k extends string
		? [r["exports"][k]] extends [never]
			? Type<never, $<r>>
			: isAny<r["exports"][k]> extends true
			? Type<any, $<r>>
			: r["exports"][k] extends PreparsedResolution
			? r["exports"][k]
			: Type<r["exports"][k], $<r>>
		: // set the nominal symbol's value to something validation won't care about
		  // since the inferred type will be omitted anyways
		  type.cast<"module">
}

export type Resolutions = {
	exports: unknown
	locals: unknown
	ambient: unknown
}

export type rootResolutions<exports> = {
	exports: exports
	locals: {}
	ambient: {}
}

export type ParseContext = {
	baseName: string
	path: string[]
	$: Scope
	args: Record<string, Type> | undefined
}

type MergedResolutions = Record<string, Type | Generic>

type ParseContextInput = Partial<ParseContext>

export type PrimitiveKeywords = typeof tsPrimitiveKeywords &
	typeof jsObjectKeywords

export class Scope<r extends Resolutions = any> {
	declare infer: extractOut<r["exports"]>
	declare inferIn: extractIn<r["exports"]>

	readonly config: ResolvedArkConfig

	private parseCache: Record<string, Type> = {}
	private resolutions: MergedResolutions
	readonly nodeCache: { [innerId: string]: UnknownNode } = {}
	readonly referencesByName: { [name: string]: UnknownNode } = {}
	references: readonly UnknownNode[] = []
	json: Json = {}
	protected resolved = false

	// these allow builtin types to be accessed during parsing without cyclic imports
	// they are populated as each scope is parsed with `registerKeywords` in its config
	/** @internal */
	static keywords = {} as PrimitiveKeywords

	/** @internal */
	get keywords(): PrimitiveKeywords {
		return Scope.keywords
	}

	/** The set of names defined at the root-level of the scope mapped to their
	 * corresponding definitions.**/
	aliases: Record<string, unknown> = {}
	private exportedNames: exportedName<r>[] = []

	constructor(def: Dict, config?: ArkConfig) {
		this.config = parseConfig(config)
		for (const k in def) {
			const parsedKey = parseScopeKey(k)
			this.aliases[parsedKey.name] = parsedKey.params.length
				? generic(parsedKey.params, def[k], this)
				: def[k]
			if (!parsedKey.isLocal) {
				this.exportedNames.push(parsedKey.name as never)
			}
		}
		if (this.config.ambient) {
			// ensure exportedResolutions is populated
			this.config.ambient.export()
			this.resolutions = { ...this.config.ambient.exportedResolutions! }
		} else {
			this.resolutions = {}
		}
		this.node(
			"union",
			{
				branches: [
					"string",
					"number",
					"object",
					"bigint",
					"symbol",
					{ unit: true },
					{ unit: false },
					{ unit: null },
					{ unit: undefined }
				]
			},
			{ reduceTo: this.node("intersection", {}, { prereduced: true }) }
		)
	}

	type: TypeParser<$<r>> = createTypeParser(this as never) as never

	schema: SchemaParser<$<r>> = this.rawSchema.bind(this) as never
	protected rawSchema(schema: unknown): ["schema", unknown] {
		return ["schema", schema] as const
	}

	match: MatchParser<$<r>> = createMatchParser(this as never) as never

	// TODO: decide if this API will be used for non-validated types
	declare: DeclarationParser<$<r>> = () => ({ type: this.type }) as never

	scope: ScopeParser<r["exports"], r["ambient"]> = ((
		def: Dict,
		config: ArkConfig = {}
	) => {
		return new Scope(def, {
			...this.config,
			// these options shouldn't be inherited
			prereducedAliases: false,
			registerKeywords: false,
			...config
		})
	}) as never

	define: DefinitionParser<$<r>> = (def) => def as never

	toAmbient(): Scope<{
		exports: r["exports"]
		locals: r["locals"]
		ambient: r["exports"]
	}> {
		// TODO: private?
		return new Scope(this.aliases, {
			...this.config,
			ambient: this
		})
	}

	// TODO: name?
	get<name extends keyof r["exports"] & string>(
		name: name
	): Type<r["exports"][name], $<r>> {
		return this.export()[name] as never
	}

	parse(def: unknown, ctx: ParseContext): Type {
		if (typeof def === "string") {
			if (ctx.args !== undefined) {
				// TODO: allow caching with this by serializing it?
				// we can only rely on the cache if there are no contextual
				// resolutions like "this" or generic args
				return this.parseString(def, ctx)
			}
			if (!this.parseCache[def]) {
				this.parseCache[def] = this.parseString(def, ctx)
			}
			return this.parseCache[def]
		}
		return hasDomain(def, "object")
			? parseObject(def, ctx)
			: throwParseError(writeBadDefinitionTypeMessage(domainOf(def)))
	}

	parseTypeRoot(def: unknown, input?: ParseContextInput): Type {
		return this.parse(def, {
			args: { this: {} as Type },
			baseName: "type",
			path: [],
			$: this,
			...input
		}).bindScope(this)
	}

	parseString(def: string, ctx: ParseContext): Type {
		return (
			this.maybeResolveNode(def) ??
			((def.endsWith("[]") &&
				this.maybeResolveNode(def.slice(0, -2))?.array()) ||
				fullStringParse(new DynamicState(def, ctx)))
		)
	}

	maybeResolve(name: string): Type | Generic | undefined {
		const cached = this.resolutions[name]
		if (cached) {
			return cached
		}
		let def = this.aliases[name]
		if (!def) return this.maybeResolveSubalias(name)
		if (isThunk(def) && !hasArkKind(def, "generic")) {
			def = def()
		}
		// TODO: initialize here?
		const resolution = hasArkKind(def, "generic")
			? validateUninstantiatedGeneric(def)
			: hasArkKind(def, "module")
			? throwParseError(writeMissingSubmoduleAccessMessage(name))
			: this.parseTypeRoot(def, { baseName: name, args: {} })
		this.resolutions[name] = resolution
		return resolution
	}

	/** If name is a valid reference to a submodule alias, return its resolution  */
	private maybeResolveSubalias(name: string) {
		const dotIndex = name.indexOf(".")
		if (dotIndex === -1) {
			return
		}
		const dotPrefix = name.slice(0, dotIndex)
		const prefixDef = this.aliases[dotPrefix]
		if (hasArkKind(prefixDef, "module")) {
			const resolution = prefixDef[name.slice(dotIndex + 1)]
			// if the first part of name is a submodule but the suffix is
			// unresolvable, we can throw immediately
			if (!resolution) {
				return throwParseError(writeUnresolvableMessage(name))
			}
			this.resolutions[name] = resolution
			return resolution
		}
		if (prefixDef !== undefined) {
			return throwParseError(writeNonSubmoduleDotMessage(dotPrefix))
		}
		// if the name includes ".", but the prefix is not an alias, it
		// might be something like a decimal literal, so just fall through to return
	}

	maybeResolveNode(name: string): Type | undefined {
		const result = this.maybeResolve(name)
		return result instanceof BaseType ? (result as never) : undefined
	}

	import<names extends exportedName<r>[]>(
		...names: names
	): destructuredImportContext<
		r,
		names extends [] ? keyof r["exports"] & string : names[number]
	> {
		return addArkKind(
			morph(this.export(...names) as Dict, (alias, value) => [
				`#${alias}`,
				value
			]) as never,
			"module"
		) as never
	}

	private exportedResolutions: MergedResolutions | undefined
	private exportCache: ExportCache | undefined
	export<names extends exportedName<r>[]>(
		...names: names
	): Module<
		names extends [] ? r : destructuredExportContext<r, names[number]>
	> {
		if (!this.exportCache) {
			this.exportCache = {}
			for (const name of this.exportedNames) {
				let def = this.aliases[name]
				if (hasArkKind(def, "generic")) {
					this.exportCache[name] = def
					continue
				}
				// TODO: thunk generics?
				// handle generics before invoking thunks, since they use
				// varargs they will incorrectly be considered thunks
				if (isThunk(def)) {
					def = def()
				}
				if (hasArkKind(def, "module")) {
					this.exportCache[name] = def
				} else {
					this.exportCache[name] = this.parseTypeRoot(def, {
						baseName: name,
						args: {}
					})
				}
			}
			this.exportedResolutions = resolutionsOfModule(this.exportCache)
			// TODO: add generic json
			this.json = morph(this.exportedResolutions, (k, v) =>
				isNode(v) ? [k, v.json] : []
			)
			Object.assign(this.resolutions, this.exportedResolutions)
			if (this.config.registerKeywords)
				Object.assign(Scope.keywords, this.exportedResolutions)
			this.references = Object.values(this.referencesByName)
			this.bindCompiledScope(this.references)
			this.resolved = true
		}
		const namesToExport = names.length ? names : this.exportedNames
		return addArkKind(
			morph(namesToExport, (_, name) => [
				name,
				this.exportCache![name]
			]) as never,
			"module"
		) as never
	}

	parseUnits<const branches extends List>(
		...values: branches
	): branches["length"] extends 1
		? UnionNode<branches[0]>
		: UnionNode<branches[number]> | UnitNode<branches[number]> {
		const uniqueValues: unknown[] = []
		for (const value of values) {
			if (!uniqueValues.includes(value)) {
				uniqueValues.push(value)
			}
		}
		const branches = uniqueValues.map((unit) => this.node("unit", { unit }))
		return branches.length === 1
			? (branches[0] as any)
			: this.node(branches, { root: true, prereduced: true })
	}

	node: NodeParser<$<r>> = this.internalNodeParser.bind(this)
	protected internalNodeParser(
		schemaOrKind: unknown,
		schemaOrOpts?: unknown,
		constraintOpts?: SchemaParseOptions
	): UnknownNode {
		const kindArg = isNodeKind(schemaOrKind) ? schemaOrKind : undefined

		let schema = kindArg ? schemaOrOpts : schemaOrKind
		const opts: SchemaParseOptions | undefined = kindArg
			? constraintOpts
			: (schemaOrOpts as never)
		if (opts?.alias && opts.alias in this.resolutions) {
			return throwInternalError(
				`Unexpected attempt to recreate existing alias ${opts.alias}`
			)
		}
		if (isArray(schema) && schema.length === 1) schema = schema[0]
		const kind = kindArg ?? typeKindOfSchema(schema)
		if (opts?.allowedKinds && !opts.allowedKinds.includes(kind)) {
			return throwParseError(
				`Schema of kind ${kind} should be one of ${opts.allowedKinds}`
			)
		}
		const node = parseAttachments(kind, schema as never, {
			$: this,
			prereduced: opts?.prereduced ?? false,
			raw: schema,
			...opts
		})
		if (opts?.root) {
			if (this.resolved) {
				// this node was not part of the original scope, so compile an anonymous scope
				// including only its references
				this.bindCompiledScope(node.contributesReferences)
			} else {
				// we're still parsing the scope itself, so defer compilation but
				// add the node as a reference
				Object.assign(this.referencesByName, node.contributesReferencesByName)
			}
		}
		return node as never
	}

	protected bindCompiledScope(references: readonly UnknownNode[]): void {
		const compiledTraversals = this.compileScope(references)
		for (const node of references) {
			if (node.jit) {
				// if node has already been bound to another scope or anonymous type, don't rebind it
				continue
			}
			node.jit = true
			node.traverseAllows =
				compiledTraversals[`${node.reference}Allows`].bind(compiledTraversals)
			if (node.isType() && !node.includesContextDependentPredicate) {
				// if the reference doesn't require context, we can assign over
				// it directly to avoid having to initialize it
				node.allows = node.traverseAllows as never
			}
			node.traverseApply =
				compiledTraversals[`${node.reference}Apply`].bind(compiledTraversals)
		}
	}

	protected compileScope(references: readonly UnknownNode[]): {
		[k: `${string}Allows`]: TraverseAllows
		[k: `${string}Apply`]: TraverseApply
	} {
		return new CompiledFunction()
			.block(`return`, (js) => {
				references.forEach((node) => {
					const allowsCompiler = new NodeCompiler("Allows").indent()
					node.compile(allowsCompiler)
					const applyCompiler = new NodeCompiler("Apply").indent()
					node.compile(applyCompiler)
					js.line(
						allowsCompiler.writeMethod(`${node.reference}Allows`) +
							",\n" +
							applyCompiler.writeMethod(`${node.reference}Apply`) +
							","
					)
				})
				return js
			})
			.compile()() as never
	}
}

type ExportCache = Record<string, Type | Generic | Module>

const resolutionsOfModule = (typeSet: ExportCache) => {
	const result: MergedResolutions = {}
	for (const k in typeSet) {
		const v = typeSet[k]
		if (hasArkKind(v, "module")) {
			const innerResolutions = resolutionsOfModule(v as never)
			const prefixedResolutions = morph(innerResolutions, (innerK, innerV) => [
				`${k}.${innerK}`,
				innerV
			])
			Object.assign(result, prefixedResolutions)
		} else if (hasArkKind(v, "generic")) {
			result[k] = v
		} else {
			result[k] = v as Type
		}
	}
	return result
}

type destructuredExportContext<
	r extends Resolutions,
	name extends exportedName<r>
> = {
	exports: { [k in name]: r["exports"][k] }
	locals: r["locals"] & {
		[k in Exclude<keyof r["exports"], name>]: r["exports"][k]
	}
	ambient: r["ambient"]
}

type destructuredImportContext<
	r extends Resolutions,
	name extends exportedName<r>
> = {
	[k in name as `#${k & string}`]: type.cast<r["exports"][k]>
}

export const writeShallowCycleErrorMessage = (
	name: string,
	seen: string[]
): string =>
	`Alias '${name}' has a shallow resolution cycle: ${[...seen, name].join(":")}`

export const writeDuplicateNameMessage = <name extends string>(
	name: name
): writeDuplicateNameMessage<name> => `Duplicate name '${name}'`

type writeDuplicateNameMessage<name extends string> = `Duplicate name '${name}'`

export type ParsedScopeKey = {
	isLocal: boolean
	name: string
	params: string[]
}

export const parseScopeKey = (k: string): ParsedScopeKey => {
	const isLocal = k[0] === "#"
	const name = isLocal ? k.slice(1) : k
	const firstParamIndex = k.indexOf("<")
	if (firstParamIndex === -1) {
		return {
			isLocal,
			name,
			params: []
		}
	}
	if (k.at(-1) !== ">") {
		throwParseError(
			`'>' must be the last character of a generic declaration in a scope`
		)
	}
	return {
		isLocal,
		name: name.slice(0, firstParamIndex),
		params: parseGenericParams(k.slice(firstParamIndex + 1, -1))
	}
}

type parseScopeKey<k> = k extends PrivateDeclaration<infer inner>
	? parsePossibleGenericDeclaration<inner, true>
	: parsePossibleGenericDeclaration<k, false>

type parsePossibleGenericDeclaration<
	k,
	isLocal extends boolean
> = k extends GenericDeclaration<infer name, infer paramString>
	? {
			isLocal: isLocal
			name: name
			params: parseGenericParams<paramString>
	  }
	: {
			isLocal: isLocal
			name: k
			params: []
	  }

export interface TypeSchemaParseOptions<allowedKind extends TypeKind = TypeKind>
	extends SchemaParseOptions {
	root?: boolean
	allowedKinds?: readonly allowedKind[]
}
