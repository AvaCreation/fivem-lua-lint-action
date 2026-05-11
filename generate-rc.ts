import fetch from "node-fetch"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import ansi from "ansi-colors"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface CfxNative {
  name: string
  params: {
    name: string
    type: string
    description: string
  }[]
  results: "int" | "void" | "long" | "BOOL" | string
  description: string
  examples: {
    lang: "lua" | string
    code: string
  }[]
  hash: string
  ns: string
  aliases?: string[]
  apiset?: string
  game: "gta5" | "rdr3" | "ny"
}

type CfxNativesResponse = {
  [group: string]: { [native: string]: CfxNative }
}

const macroCaseToSnake = (s: string): string => {
  return s
    .split("_")
    .map(str =>
      str
        .split("")
        .map((c, i) => {
          if (+c > 0) return `_${c}`
          return i === 0 ? c.toUpperCase() : c.toLowerCase()
        })
        .join("")
    )
    .join("")
}

const uniqueArray = <T>(a: T[]): T[] => {
  const b: T[] = []
  a.forEach(item => {
    if (b.includes(item)) return
    b.push(item)
  })
  return b
}

const reduceNativesToNames = (results: string[], item: CfxNative): string[] => {
  let name = (item.name && macroCaseToSnake(item.name)) || `N_${item.hash}`
  results.push(name)
  ;(item.aliases || []).forEach(a => {
    if (a.slice(0, 1) === "_") {
      let aliasName = macroCaseToSnake(a.slice(1))
      if (aliasName === "GetGroundZFor3dCoord") {
        aliasName = "GetGroundZFor_3dCoord"
      }
      results.push(aliasName)
    }
  })
  return results
}

interface MappedNativeResponse {
  shared: string[]
  client: string[]
  server: string[]
}

async function fetchAllNatives(): Promise<MappedNativeResponse> {
  const clientNatives: string[] = []
  const serverNatives: string[] = []
  const sharedNatives: string[] = []
  const urls = [
    "https://static.cfx.re/natives/natives_cfx.json",
    "https://static.cfx.re/natives/natives.json",
    "https://raw.githubusercontent.com/alloc8or/rdr3-nativedb-data/master/natives.json"
  ]

  for (const url of urls) {
    console.log(ansi.cyan(`fetch => ${ansi.blueBright(url)}...`))
    try {
      const response = await fetch(url)
      if (!response.ok) {
        console.log(
          ansi.red(
            `Failed to fetch ${url}: ${response.status} ${response.statusText}`
          )
        )
        continue
      }
      const data = (await response.json()) as CfxNativesResponse

      const nativesList: CfxNative[] = Object.entries(data).reduce(
        (natives: CfxNative[], [_, list]) => {
          natives.push(...Object.values(list))
          return natives
        },
        []
      )

      clientNatives.push(
        ...nativesList
          .filter(n => !n.apiset || n.apiset === "client")
          .reduce(reduceNativesToNames, [])
      )
      serverNatives.push(
        ...nativesList
          .filter(n => n.apiset === "server")
          .reduce(reduceNativesToNames, [])
      )
      sharedNatives.push(
        ...nativesList
          .filter(n => n.apiset === "shared")
          .reduce(reduceNativesToNames, [])
      )
    } catch (error) {
      console.log(ansi.red(`Error fetching ${url}: ${error}`))
      continue
    }
  }

  return {
    shared: uniqueArray(sharedNatives),
    client: uniqueArray(clientNatives),
    server: uniqueArray(serverNatives)
  }
}

fetchAllNatives().then(natives => {
  let template = fs.readFileSync(
    path.join(__dirname, ".luacheckrc.template"),
    "utf-8"
  )
  template = template
    .replace("%%SHARED_GLOBALS%%", natives.shared.map(s => `'${s}'`).join(", "))
    .replace("%%SERVER_GLOBALS%%", natives.server.map(s => `'${s}'`).join(", "))
    .replace("%%CLIENT_GLOBALS%%", natives.client.map(s => `'${s}'`).join(", "))

  let extraLibs = ""
  const extraLibUserArg = process.argv[2]
  if (extraLibUserArg?.length) {
    extraLibs = `+${extraLibUserArg}`
  }

  if (extraLibs.length) {
    console.log(
      ansi.gray(
        `${ansi.yellow(`extra`)} ${ansi.cyan(`=>`)} ${ansi.magentaBright(
          extraLibs
        )}`
      )
    )
  }

  template = template.replace(/%%EXTRA%%/g, extraLibs)

  fs.writeFileSync(path.join(__dirname, ".luacheckrc.default"), template)

  // Used in entrypoints to determine which natives are valid in which apiset
  fs.writeFileSync(
    path.join(__dirname, "client-natives.json"),
    JSON.stringify(natives.client)
  )
  fs.writeFileSync(
    path.join(__dirname, "server-natives.json"),
    JSON.stringify(natives.server)
  )

  console.log(ansi.gray(`=`.repeat(29)))
  console.log(
    ansi.gray(
      `=== ${ansi.yellow(
        natives.shared.length.toString()
      )} ${ansi.magentaBright("shared")} generated`.padEnd(45, " ") + " ==="
    )
  )
  console.log(
    ansi.gray(
      `=== ${ansi.blue(natives.server.length.toString())} ${ansi.magentaBright(
        "server"
      )} generated`.padEnd(45, " ") + " ==="
    )
  )
  console.log(
    ansi.gray(
      `=== ${ansi.green(natives.client.length.toString())} ${ansi.magentaBright(
        "client"
      )} generated`.padEnd(45, " ") + " ==="
    )
  )
  console.log(ansi.gray(`========[ ${ansi.greenBright("COMPLETED")} ]========`))
})
