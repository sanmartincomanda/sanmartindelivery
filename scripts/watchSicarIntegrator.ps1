[CmdletBinding()]
param(
  [string]$TaskName = 'SanMartin SICAR Integrator',
  [string]$HealthUrl = 'http://127.0.0.1:3077/api/sicar/health',
  [string]$RepoRoot = '',
  [int]$StartupGraceSeconds = 120
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot.Trim()) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$logDir = Join-Path $RepoRoot 'logs'
$logPath = Join-Path $logDir 'sicar-integrator-watchdog.log'
$circuitStatePath = Join-Path $logDir 'sicar-integrator-circuit.json'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-WatchdogLog {
  param(
    [string]$Message,
    [string]$Level = 'INFO'
  )

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $logPath -Value "[$timestamp] [$Level] $Message"
}

function Test-SicarBridgeHealth {
  try {
    $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 4
    return $response -and $response.ok -eq $true
  } catch {
    return $false
  }
}

function Test-CircuitProtectionWindow {
  if (-not (Test-Path -LiteralPath $circuitStatePath)) {
    return $false
  }

  try {
    $state = Get-Content -LiteralPath $circuitStatePath -Raw | ConvertFrom-Json
    $now = Get-Date

    if ($state.state -eq 'open' -and $state.openUntil) {
      $openUntil = [DateTimeOffset]::Parse([string]$state.openUntil).LocalDateTime
      if ($openUntil.AddSeconds($StartupGraceSeconds) -gt $now) {
        return $true
      }
    }

    if ($state.state -eq 'degraded' -and $state.nextAttemptAt) {
      $nextAttemptAt = [DateTimeOffset]::Parse([string]$state.nextAttemptAt).LocalDateTime
      if ($nextAttemptAt.AddSeconds(15) -gt $now) {
        return $true
      }
    }

    if (($state.state -eq 'starting' -or $state.state -eq 'half_open') -and $state.updatedAt) {
      $updatedAt = [DateTimeOffset]::Parse([string]$state.updatedAt).LocalDateTime
      if ($updatedAt.AddSeconds($StartupGraceSeconds) -gt $now) {
        return $true
      }
    }
  } catch {
    Write-WatchdogLog "No se pudo interpretar el estado del cortocircuito: $($_.Exception.Message)" 'WARN'
  }

  return $false
}

if (Test-SicarBridgeHealth) {
  exit 0
}

if (Test-CircuitProtectionWindow) {
  exit 0
}

try {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop

  if ($task.State -eq 'Running') {
    Write-WatchdogLog 'El agente no responde aunque la tarea figura activa. Reiniciando la tarea.' 'WARN'
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  } else {
    Write-WatchdogLog "El agente no responde y la tarea esta en estado $($task.State). Iniciando la tarea." 'WARN'
  }

  Start-ScheduledTask -TaskName $TaskName

  for ($attempt = 1; $attempt -le 8; $attempt += 1) {
    Start-Sleep -Seconds 2
    if (Test-SicarBridgeHealth) {
      Write-WatchdogLog "Agente recuperado correctamente en el intento $attempt."
      exit 0
    }

    if (Test-CircuitProtectionWindow) {
      exit 0
    }
  }

  Write-WatchdogLog 'La tarea se inicio, pero el agente no respondio dentro de 16 segundos.' 'ERROR'
  exit 1
} catch {
  Write-WatchdogLog "No se pudo recuperar el agente: $($_.Exception.Message)" 'ERROR'
  exit 1
}
