param(
  [switch]$SkipBuild
)

if (-not $SkipBuild) {
  npm --workspace apps/desktop run build
}

Write-Host "Desktop smoke check complete."
