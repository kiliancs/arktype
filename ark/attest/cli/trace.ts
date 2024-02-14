import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

export const trace = (args: string[]) => {
	const packageDir = args[0]

	// for some reason pnpm installing @typescript/analyze-trace is resulting in a .bin file referencing a dist folder
	// at the wrong relative path, so resolving this directly for now (should be changed if this is resolved)
	const analyzeTraceBin = join(
		process.cwd(),
		"node_modules",
		"@typescript",
		"analyze-trace",
		"bin",
		"analyze-trace"
	)

	if (!existsSync(packageDir)) {
		throw new Error(
			`trace requires an argument for an existing directory to trace, e.g. 'pnpm attest trace packages/api'`
		)
	}

	try {
		console.log(`⏳ Gathering type trace data for ${packageDir}...`)
		// These cache files have to be removed before any analysis is done otherwise
		// the results will be meaningless.

		// the .tstrace directory will contain a trace.json file and a types.json file.
		// the trace.json file can be viewed via a tool like https://ui.perfetto.dev/
		// the types.json file can be used to associate IDs from the trace file with type aliases
		execSync(
			"pnpm tsc --noEmit --extendedDiagnostics --generateTrace .tstrace",
			{
				cwd: packageDir,
				stdio: "inherit"
			}
		)
	} catch (e) {
		console.error(String(e))
	} finally {
		console.log(`⏳ Analyzing type trace data for ${packageDir}...`)
		// TypeScript's analyze-trace tool can be used to automatically detect hot-spots in your code.
		// It's not a perfect match for what can be optimized, but it can be a helpful place to start
		execSync(`node ${analyzeTraceBin} ${join(packageDir, ".tstrace")}`, {
			stdio: "inherit"
		})
	}
}