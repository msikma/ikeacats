#!/usr/bin/env node

// ikeacats-cli <https://github.com/msikma/ikeacats>
// © MIT license

const cheerio = require('cheerio')
const { resolve } = require('path')
const { makeArgParser } = require('dada-cli-tools/argparse')
const { extractScriptResult } = require('dada-cli-tools/util/vm')
const { progName, ensureDirBool } = require('dada-cli-tools/util/fs')
const { findTagContent } = require('dada-cli-tools/util/html')
const { wait } = require('dada-cli-tools/util/misc')
const { request, downloadFileLogged } = require('dada-cli-tools/request')
const { log, logFatal, die } = require('dada-cli-tools/log')
const { ensurePeriod } = require('dada-cli-tools/util/text')
const { readJSONSync } = require('dada-cli-tools/util/fs')

const URL_CATALOG_DATA = () => 'https://ikeamuseum.com/wp-content/themes/ikea-museum/includes/catalogues/external/listing.json'
const URL_CATALOG_PAGE = id => `https://ikeacatalogues.ikea.com/sv-${id}`

const pkgPath = resolve(__dirname)
const pkgData = readJSONSync(`${pkgPath}/package.json`)

const parser = makeArgParser({
  version: pkgData.version,
  addHelp: true,
  description: ensurePeriod(pkgData.description)
})

parser.addArgument('--target', { help: 'Target directory to save files to.', metavar: 'DIR', dest: 'target', defaultValue: `output` })

// Parse input. If usage is incorrect, the program will exit and display an error here.
const parsed = { ...parser.parseArgs() }

/** Main program. */
const main = async ({ target }, { pkgData, baseDir }) => {
  const catalogueStr = await request(URL_CATALOG_DATA())
  const catalogueData = extractScriptResult(catalogueStr.body)
  if (!catalogueData.success || !catalogueData.sandbox.listings) {
    logFatal(`${progName()}: could not extract data from listing.json file`)
    logFatal(catalogueData.error)
    die()
  }

  const hasDir = await ensureDirBool(target)
  if (!hasDir) {
    die('could not create target directory:', target)
  }

  log(`Downloading IKEA catalogues. This will take around 12GB of space as of 2020-08-16.`)
  log('Retrieving PDF download URLs...')
  const catalogues = []
  const { listings } = catalogueData.sandbox
  for (const listing of listings) {
    const url = URL_CATALOG_PAGE(listing.id)
    const $html = cheerio.load((await request(url)).body)
    const dataTagRaw = findTagContent($html, 'script', 'Reader.Bootstrap.init')
    const dataTag = dataTagRaw.match(/var data = \{[\s\S]+?};/m)[0]
    const data = extractScriptResult(dataTag)
    const { config } = data.sandbox.data
    const { publicationTitle, downloadPdfUrl } = config
    catalogues.push({ title: publicationTitle, url: downloadPdfUrl })
    await wait(500)
  }

  log(`Downloading ${catalogues.length} PDFs...`)
  for (const catalogue of catalogues) {
    const { title, url } = catalogue
    log(`Downloading: ${title} (${url})`)
    await downloadFileLogged(url, `${target}/${title}.pdf`)
    await wait(500)
  }

  log('All done.')
  process.exit(0)
}

// Run the main program.
main(parsed, { pkgData, baseDir: pkgPath })
