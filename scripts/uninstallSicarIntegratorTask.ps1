[CmdletBinding()]
param(
  [string]$TaskName = 'SanMartin SICAR Integrator',
  [switch]$StopBridgeProcess
)

$ErrorActionPreference = 'Stop'

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

if ($StopBridgeProcess) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -eq 'node.exe' -and
      $_.CommandLine -like '*scripts/sicarBridgeServer.mjs*'
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Write-Output "TaskRemoved=$TaskName"
