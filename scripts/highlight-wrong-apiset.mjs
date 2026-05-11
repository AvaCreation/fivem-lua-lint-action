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

const isServerContext = filePath => {
  const n = norm(filePath)
  const base = path.basename(n)
  if (/\/server\//.test(n)) return true
  if (base === "server.lua") return true
  if (/^sv_.+\.lua$/.test(base)) return true
  return false
}

const isClientContext = filePath => {
  const n = norm(filePath)
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
