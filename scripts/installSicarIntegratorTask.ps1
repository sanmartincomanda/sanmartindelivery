[CmdletBinding()]
param(
  [string]$TaskName = 'SanMartin SICAR Integrator',
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scriptPath = Join-Path $repoRoot 'scripts\runSicarIntegrator.ps1'
$nodePath = if (Test-Path 'C:\Program Files\nodejs\node.exe') {
  'C:\Program Files\nodejs\node.exe'
} elseif (Test-Path 'C:\Program Files (x86)\nodejs\node.exe') {
  'C:\Program Files (x86)\nodejs\node.exe'
} else {
  throw 'No se encontro node.exe en una ruta conocida para registrar el integrador.'
}

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "No se encontro el supervisor del integrador en $scriptPath"
}

$escapedScriptPath = '"' + $scriptPath + '"'
$escapedRepoRoot = '"' + $repoRoot + '"'
$escapedNodePath = '"' + $nodePath + '"'
$arguments = "-NoProfile -ExecutionPolicy Bypass -File $escapedScriptPath -RepoRoot $escapedRepoRoot -NodeExePath $escapedNodePath"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$installMode = 'startup-system'

try {
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Inicia el integrador SICAR de San Martin Delivery al encender el servidor.' `
    -Force | Out-Null
} catch {
  $userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
  $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Inicia el integrador SICAR de San Martin Delivery al iniciar sesion en el servidor.' `
    -Force | Out-Null

  $installMode = 'logon-user-fallback'
}

if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Output "TaskName=$TaskName"
Write-Output "InstallMode=$installMode"
Write-Output "RepoRoot=$repoRoot"
Write-Output "ScriptPath=$scriptPath"
Write-Output "NodePath=$nodePath"
