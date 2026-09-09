[CmdletBinding()]
param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectId = 'ryb-limpiezas-app'
$expectedBranch = 'fix/companion-ops-and-rules'

$branch = (git branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
  throw "El despliegue de staging solo se permite desde '$expectedBranch'. Rama actual: '$branch'."
}

$pendingChanges = git status --porcelain
if ($pendingChanges) {
  throw 'El repositorio contiene cambios sin commit. Revisa y congela el RC antes de desplegar.'
}

node scripts/audit_signatures.cjs
if ($LASTEXITCODE -ne 0) {
  throw 'La auditoria de firmas tenant ha fallado.'
}

if (-not $SkipTests) {
  npx.cmd --yes firebase-tools@latest emulators:exec `
    --project demo-project `
    --only auth,firestore,functions,storage `
    'npx mocha test/*.spec.cjs'
  if ($LASTEXITCODE -ne 0) {
    throw 'La suite de emuladores ha fallado.'
  }
}

npm.cmd run build
if ($LASTEXITCODE -ne 0) {
  throw 'La compilacion de produccion ha fallado.'
}

npx.cmd --yes firebase-tools@latest deploy `
  --project $projectId `
  --only 'firestore:rules,firestore:indexes,storage,functions,hosting' `
  --non-interactive
if ($LASTEXITCODE -ne 0) {
  throw 'Firebase no ha completado el despliegue.'
}
