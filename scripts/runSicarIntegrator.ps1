[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$NodeExePath = ""
)

$ErrorActionPreference = 'Stop'

function Resolve-NodePath {
  param([string]$PreferredPath)

  $candidates = @(
    $PreferredPath,
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe'
  ) | Where-Object { $_ -and $_.Trim() }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  try {
    $command = Get-Command node -ErrorAction Stop
    if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
      return (Resolve-Path -LiteralPath $command.Source).Path
    }
  } catch {
  }

  throw 'No se encontro node.exe para iniciar el integrador SICAR.'
}

function Write-IntegratorLog {
  param(
    [string]$Message,
    [string]$Level = 'INFO'
  )

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $line = "[$timestamp] [$Level] $Message"
  Add-Content -LiteralPath $script:LogPath -Value $line
}

if (-not $RepoRoot.Trim()) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$NodeExePath = Resolve-NodePath -PreferredPath $NodeExePath
$LogDir = Join-Path $RepoRoot 'logs'
$script:LogPath = Join-Path $LogDir 'sicar-integrator.log'
$BridgeScriptPath = Join-Path $RepoRoot 'scripts\sicarBridgeServer.mjs'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path -LiteralPath $BridgeScriptPath)) {
  throw "No se encontro el puente SICAR en $BridgeScriptPath"
}

Write-IntegratorLog "Integrador SICAR iniciando. Repo=$RepoRoot Node=$NodeExePath"
Set-Location -LiteralPath $RepoRoot

while ($true) {
  try {
    $existing = Get-CimInstance Win32_Process -ErrorAction Stop |
      Where-Object {
        $_.Name -eq 'node.exe' -and
        $_.CommandLine -like '*sicarBridgeServer.mjs*' -and
        $_.ProcessId -ne $PID
      } |
      Select-Object -First 1

    if ($existing) {
      Write-IntegratorLog "Ya existe un puente SICAR activo en PID $($existing.ProcessId). El supervisor no iniciara otro." 'WARN'
      Start-Sleep -Seconds 30
      continue
    }

    Write-IntegratorLog 'Levantando puente SICAR.'
    & $NodeExePath $BridgeScriptPath *>> $script:LogPath
    $exitCode = $LASTEXITCODE
    Write-IntegratorLog "Puente SICAR finalizo con codigo $exitCode. Reiniciando en 5 segundos." 'WARN'
  } catch {
    Write-IntegratorLog "Fallo del supervisor: $($_.Exception.Message)" 'ERROR'
  }

  Start-Sleep -Seconds 5
}
