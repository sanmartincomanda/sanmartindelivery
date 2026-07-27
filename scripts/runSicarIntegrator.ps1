[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$NodeExePath = "",
  [int]$RapidFailureThreshold = 5,
  [int]$RapidFailureWindowSeconds = 300,
  [int]$HealthyRunSeconds = 600,
  [int]$InitialRestartDelaySeconds = 5,
  [int]$MaxRestartDelaySeconds = 300,
  [int]$InitialCircuitOpenSeconds = 900,
  [int]$MaxCircuitOpenSeconds = 3600
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

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

function Set-CircuitState {
  param(
    [string]$State,
    [string]$Reason = '',
    [int]$FailureCount = 0,
    [datetime]$OpenUntil = [datetime]::MinValue,
    [datetime]$NextAttemptAt = [datetime]::MinValue,
    [int]$CooldownSeconds = 0
  )

  $payload = [ordered]@{
    state = $State
    reason = $Reason
    failureCount = $FailureCount
    cooldownSeconds = $CooldownSeconds
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    openUntil = if ($OpenUntil -gt [datetime]::MinValue) { $OpenUntil.ToUniversalTime().ToString('o') } else { $null }
    nextAttemptAt = if ($NextAttemptAt -gt [datetime]::MinValue) { $NextAttemptAt.ToUniversalTime().ToString('o') } else { $null }
  }

  $temporaryPath = "$script:CircuitStatePath.tmp"
  $payload | ConvertTo-Json | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
  Move-Item -LiteralPath $temporaryPath -Destination $script:CircuitStatePath -Force
}

function Get-PersistedCircuitState {
  if (-not (Test-Path -LiteralPath $script:CircuitStatePath)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $script:CircuitStatePath -Raw | ConvertFrom-Json
  } catch {
    Write-IntegratorLog "No se pudo leer el estado anterior del cortocircuito: $($_.Exception.Message)" 'WARN'
    return $null
  }
}

function Wait-WithCircuitOpen {
  param(
    [string]$Reason,
    [int]$FailureCount
  )

  $cooldownSeconds = [Math]::Min($script:CircuitOpenSeconds, $MaxCircuitOpenSeconds)
  $openUntil = (Get-Date).AddSeconds($cooldownSeconds)
  Set-CircuitState `
    -State 'open' `
    -Reason $Reason `
    -FailureCount $FailureCount `
    -OpenUntil $openUntil `
    -CooldownSeconds $cooldownSeconds
  Write-IntegratorLog "Cortocircuito ABIERTO por $cooldownSeconds segundos tras $FailureCount fallos rapidos. Motivo: $Reason" 'ERROR'

  Start-Sleep -Seconds $cooldownSeconds

  $script:IsHalfOpenAttempt = $true
  $script:CircuitOpenSeconds = [Math]::Min($cooldownSeconds * 2, $MaxCircuitOpenSeconds)
  $script:RapidFailureTimes.Clear()
  $script:RestartDelaySeconds = $InitialRestartDelaySeconds
  Set-CircuitState -State 'half_open' -Reason 'Intento controlado despues del periodo de espera.' -CooldownSeconds $cooldownSeconds
  Write-IntegratorLog 'Cortocircuito en MEDIO ABIERTO. Se permitira un unico intento controlado.' 'WARN'
}

if (-not $RepoRoot.Trim()) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$NodeExePath = Resolve-NodePath -PreferredPath $NodeExePath
$LogDir = Join-Path $RepoRoot 'logs'
$script:LogPath = Join-Path $LogDir 'sicar-integrator.log'
$script:CircuitStatePath = Join-Path $LogDir 'sicar-integrator-circuit.json'
$BridgeScriptPath = Join-Path $RepoRoot 'scripts\sicarBridgeServer.mjs'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path -LiteralPath $BridgeScriptPath)) {
  throw "No se encontro el puente SICAR en $BridgeScriptPath"
}

$RapidFailureThreshold = [Math]::Max(2, $RapidFailureThreshold)
$RapidFailureWindowSeconds = [Math]::Max(30, $RapidFailureWindowSeconds)
$HealthyRunSeconds = [Math]::Max($RapidFailureWindowSeconds, $HealthyRunSeconds)
$InitialRestartDelaySeconds = [Math]::Max(1, $InitialRestartDelaySeconds)
$MaxRestartDelaySeconds = [Math]::Max($InitialRestartDelaySeconds, $MaxRestartDelaySeconds)
$InitialCircuitOpenSeconds = [Math]::Max(60, $InitialCircuitOpenSeconds)
$MaxCircuitOpenSeconds = [Math]::Max($InitialCircuitOpenSeconds, $MaxCircuitOpenSeconds)

$script:RapidFailureTimes = [System.Collections.Generic.List[datetime]]::new()
$script:RestartDelaySeconds = $InitialRestartDelaySeconds
$script:CircuitOpenSeconds = $InitialCircuitOpenSeconds
$script:IsHalfOpenAttempt = $false
$lastExistingBridgePid = 0

Write-IntegratorLog "Integrador SICAR iniciando. Repo=$RepoRoot Node=$NodeExePath"
Set-Location -LiteralPath $RepoRoot

$persistedState = Get-PersistedCircuitState
if ($persistedState -and $persistedState.state -eq 'open' -and $persistedState.openUntil) {
  try {
    $persistedOpenUntil = [DateTimeOffset]::Parse([string]$persistedState.openUntil).LocalDateTime
    $remainingSeconds = [Math]::Ceiling(($persistedOpenUntil - (Get-Date)).TotalSeconds)
    if ($remainingSeconds -gt 0) {
      $previousCooldown = [Math]::Max($InitialCircuitOpenSeconds, [int]$persistedState.cooldownSeconds)
      $script:CircuitOpenSeconds = [Math]::Min($previousCooldown * 2, $MaxCircuitOpenSeconds)
      Write-IntegratorLog "Cortocircuito persistente activo. Se respetaran $remainingSeconds segundos restantes." 'WARN'
      Start-Sleep -Seconds $remainingSeconds
      $script:IsHalfOpenAttempt = $true
      Set-CircuitState -State 'half_open' -Reason 'Intento controlado despues de restaurar el circuito.' -CooldownSeconds $previousCooldown
    }
  } catch {
    Write-IntegratorLog "Estado persistente del cortocircuito invalido: $($_.Exception.Message)" 'WARN'
  }
}

while ($true) {
  $attemptStartedAt = Get-Date
  $failureReason = ''

  try {
    $existing = Get-CimInstance Win32_Process -ErrorAction Stop |
      Where-Object {
        $_.Name -eq 'node.exe' -and
        $_.CommandLine -like '*sicarBridgeServer.mjs*' -and
        $_.ProcessId -ne $PID
      } |
      Select-Object -First 1

    if ($existing) {
      if ($lastExistingBridgePid -ne $existing.ProcessId) {
        Write-IntegratorLog "Ya existe un puente SICAR activo en PID $($existing.ProcessId). El supervisor no iniciara otro." 'WARN'
        $lastExistingBridgePid = $existing.ProcessId
      }
      $script:RapidFailureTimes.Clear()
      $script:RestartDelaySeconds = $InitialRestartDelaySeconds
      $script:CircuitOpenSeconds = $InitialCircuitOpenSeconds
      $script:IsHalfOpenAttempt = $false
      Set-CircuitState -State 'external_running' -Reason "Puente activo en PID $($existing.ProcessId)."
      Start-Sleep -Seconds 30
      continue
    }

    $lastExistingBridgePid = 0
    Set-CircuitState -State 'starting' -Reason 'Iniciando puente SICAR.' -FailureCount $script:RapidFailureTimes.Count
    Write-IntegratorLog 'Levantando puente SICAR.'
    & $NodeExePath $BridgeScriptPath *>> $script:LogPath
    $exitCode = $LASTEXITCODE
    $failureReason = "Puente SICAR finalizo con codigo $exitCode."
  } catch {
    $failureReason = "Fallo del supervisor: $($_.Exception.Message)"
  }

  $runSeconds = [Math]::Max(0, [Math]::Floor(((Get-Date) - $attemptStartedAt).TotalSeconds))
  Write-IntegratorLog "$failureReason Duracion=${runSeconds}s." 'WARN'

  if ($runSeconds -ge $HealthyRunSeconds) {
    $script:RapidFailureTimes.Clear()
    $script:RestartDelaySeconds = $InitialRestartDelaySeconds
    $script:CircuitOpenSeconds = $InitialCircuitOpenSeconds
    $script:IsHalfOpenAttempt = $false
    Write-IntegratorLog "El puente estuvo estable durante ${runSeconds}s; se reinicio el contador de fallos."
  }

  if ($script:IsHalfOpenAttempt -and $runSeconds -lt $HealthyRunSeconds) {
    $script:IsHalfOpenAttempt = $false
    Wait-WithCircuitOpen -Reason $failureReason -FailureCount 1
    continue
  }

  $failureCutoff = (Get-Date).AddSeconds(-$RapidFailureWindowSeconds)
  for ($index = $script:RapidFailureTimes.Count - 1; $index -ge 0; $index -= 1) {
    if ($script:RapidFailureTimes[$index] -lt $failureCutoff) {
      $script:RapidFailureTimes.RemoveAt($index)
    }
  }
  $script:RapidFailureTimes.Add((Get-Date))

  if ($script:RapidFailureTimes.Count -ge $RapidFailureThreshold) {
    Wait-WithCircuitOpen -Reason $failureReason -FailureCount $script:RapidFailureTimes.Count
    continue
  }

  $delaySeconds = [Math]::Min($script:RestartDelaySeconds, $MaxRestartDelaySeconds)
  $nextAttemptAt = (Get-Date).AddSeconds($delaySeconds)
  Set-CircuitState `
    -State 'degraded' `
    -Reason $failureReason `
    -FailureCount $script:RapidFailureTimes.Count `
    -NextAttemptAt $nextAttemptAt
  Write-IntegratorLog "Reintento $($script:RapidFailureTimes.Count)/$RapidFailureThreshold en $delaySeconds segundos." 'WARN'
  Start-Sleep -Seconds $delaySeconds
  $script:RestartDelaySeconds = [Math]::Min($delaySeconds * 2, $MaxRestartDelaySeconds)
}
