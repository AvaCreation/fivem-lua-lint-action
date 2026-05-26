#!/usr/bin/env node
// Post-processes luacheck output to flag apiset-restricted natives used in the wrong context:
//   - client-only natives called from a server-side file
//   - server-only natives called from a client-side file
//
// Reads:
//   argv[2] = luacheck plain-format output file
//   argv[3] = client-natives.json
//   argv[4] = server-natives.json
//
// Exits 1 when at least one violation is found, 0 otherwise.
import fs from "node:fs"
import path from "node:path"
import ansi from "ansi-colors"

const [, , outFile, clientFile, serverFile] = process.argv
if (!outFile || !clientFile || !serverFile) {
  console.error(
    "usage: highlight-wrong-apiset.mjs <luacheck-output> <client-natives.json> <server-natives.json>"
  )
  process.exit(2)
}

if (
  !fs.existsSync(outFile) ||
  !fs.existsSync(clientFile) ||
  !fs.existsSync(serverFile)
) {
  process.exit(0)
}

const clientNatives = new Set(JSON.parse(fs.readFileSync(clientFile, "utf-8")))
const serverNatives = new Set(JSON.parse(fs.readFileSync(serverFile, "utf-8")))
const text = fs.readFileSync(outFile, "utf-8")

const norm = p => p.replace(/\\/g, "/")

function parseFxManifest(content) {
  // Strip line comments
  const clean = content.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "")
  const result = {}
  const stringReg = /^\s*(\w+)\s+'([^']+)'/gm
  let m
  while ((m = stringReg.exec(clean)) !== null) {
    result[m[1]] = [m[2]]
  }
  const tableReg = /^\s*(\w+)\s*\{([^}]*)\}/gm
  while ((m = tableReg.exec(clean)) !== null) {
    const items = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1])
    if (items.length) result[m[1]] = items
  }
  return result
}

function globToRegex(glob) {
  const g = norm(glob)
  let re = "^"
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === "*") {
      if (g[i + 1] === "*") {
        re += ".*"
        i++
        if (g[i + 1] === "/") i++
      } else {
        re += "[^/]*"
      }
    } else if (c === "?") {
      re += "[^/]"
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      re += "\\" + c
    } else {
      re += c
    }
  }
  return new RegExp(re + "$")
}

function walkLua(dir, out, root) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue
      walkLua(full, out, root)
    } else if (e.isFile() && e.name.endsWith(".lua")) {
      out.push(norm(path.relative(root, full)))
    }
  }
}

function buildManifestMap(root) {
  const map = new Map()
  const manifest = path.join(root, "fxmanifest.lua")
  if (!fs.existsSync(manifest)) return map
  let parsed
  try { parsed = parseFxManifest(fs.readFileSync(manifest, "utf-8")) } catch { return map }
  const luaFiles = []
  walkLua(root, luaFiles, root)
  const kinds = {
    server_script: "server", server_scripts: "server",
    client_script: "client", client_scripts: "client",
    shared_script: "shared", shared_scripts: "shared",
  }
  for (const [key, kind] of Object.entries(kinds)) {
    const entries = parsed[key]
    if (!entries) continue
    for (const entry of entries) {
      if (entry.startsWith("@")) continue
      const re = globToRegex(entry)
      for (const f of luaFiles) {
        if (!re.test(f)) continue
        if (!map.has(f)) map.set(f, kind)
      }
    }
  }
  return map
}

const manifestMap = buildManifestMap(process.cwd())

const isServerContext = filePath => {
  const n = norm(path.relative(process.cwd(), path.resolve(filePath)))
  const kind = manifestMap.get(n)
  if (kind) return kind === "server"
  const base = path.basename(n)
  if (/\/server\//.test(n)) return true
  if (base === "server.lua") return true
  if (/^sv_.+\.lua$/.test(base)) return true
  return false
}

const isClientContext = filePath => {
  const n = norm(path.relative(process.cwd(), path.resolve(filePath)))
  const kind = manifestMap.get(n)
  if (kind) return kind === "client"
  const base = path.basename(n)
  if (/\/client\//.test(n)) return true
  if (base === "client.lua") return true
  if (/^cl_.+\.lua$/.test(base)) return true
  return false
}

const lineRe = /^\s*(.+?\.lua):(\d+):(\d+):\s+(.*)$/
const undefRe = /accessing undefined variable '?([A-Za-z_]\w*)'?/

const clientOnServer = []
const serverOnClient = []

for (const raw of text.split(/\r?\n/)) {
  const m = raw.match(lineRe)
  if (!m) continue
  const [, file, line, col, msg] = m
  const u = msg.match(undefRe)
  if (!u) continue
  const name = u[1]
  if (clientNatives.has(name) && isServerContext(file)) {
    clientOnServer.push({ file, line, col, name })
  } else if (serverNatives.has(name) && isClientContext(file)) {
    serverOnClient.push({ file, line, col, name })
  }
}

const total = clientOnServer.length + serverOnClient.length
if (total === 0) process.exit(0)

const printBlock = (title, list, side, otherSide) => {
  const titleStyle = side === "client" ? ansi.cyan.bold : ansi.yellow.bold
  const bar = "=".repeat(50)
  console.log("")
  console.log(titleStyle(`====[ ${title} ]====`))
  for (const v of list) {
    const loc = ansi.gray(`${v.file}:${v.line}:${v.col}:`)
    const name = ansi.magenta.bold(`'${v.name}'`)
    const ctx = ansi.dim(`cannot be called from ${otherSide}-side code`)
    console.log(`${loc} ${side} native ${name} ${ctx}`)
  }
  console.log(ansi.gray(bar))
  console.log(ansi.bold(`total: ${ansi.red(list.length)}`))
}

if (clientOnServer.length) {
  printBlock(
    "client-only natives used on the server",
    clientOnServer,
    "client",
    "server"
  )
}

if (serverOnClient.length) {
  printBlock(
    "server-only natives used on the client",
    serverOnClient,
    "server",
    "client"
  )
}
process.exit(1)
