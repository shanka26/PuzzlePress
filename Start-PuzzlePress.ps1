$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostName = "127.0.0.1"
$port = 3000
$url = "http://$hostName`:$port"
$logDir = Join-Path $appDir "tmp"
$logPath = Join-Path $logDir "puzzlepress-launch.log"
$serverOutPath = Join-Path $logDir "puzzlepress-server.out.log"
$serverErrPath = Join-Path $logDir "puzzlepress-server.err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Content -LiteralPath $logPath -Value $null -Encoding utf8
Set-Content -LiteralPath $serverOutPath -Value $null -Encoding utf8
Set-Content -LiteralPath $serverErrPath -Value $null -Encoding utf8

function Write-LaunchLog {
  param([string] $Message)

  $line = "$(Get-Date -Format s) $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
}

function Get-NpmCommand {
  $command = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $fallback = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
  if (Test-Path -LiteralPath $fallback) { return $fallback }

  throw "Could not find npm.cmd. Install Node.js, then try Start-PuzzlePress.bat again."
}

function Test-ServerReady {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-LocalPort {
  param([int] $Port)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $processIds) {
    if ($processId -and $processId -ne $PID) {
      Write-Host "Stopping existing PuzzlePress server process $processId on port $Port..."
      Write-LaunchLog "Stopping existing port process $processId on port $Port."
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $stillListening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $stillListening) { return }
    Start-Sleep -Milliseconds 250
  }

  throw "Port $Port is still in use. Close the process using it, then run the launcher again."
}

function Wait-ForServer {
  param([System.Diagnostics.Process] $Process)

  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if ($Process.HasExited) { return $false }
    if (Test-ServerReady) { return $true }
    Start-Sleep -Seconds 1
  }

  return $false
}

function Start-PuzzlePressServer {
  param([string] $NpmCommand)

  Write-LaunchLog "Starting npm dev server with $NpmCommand."
  $arguments = @("run", "dev", "--", "--hostname", $hostName, "--port", "$port")

  return Start-Process `
    -FilePath $NpmCommand `
    -ArgumentList $arguments `
    -WorkingDirectory $appDir `
    -RedirectStandardOutput $serverOutPath `
    -RedirectStandardError $serverErrPath `
    -PassThru `
    -WindowStyle Hidden
}

Write-Host "Starting PuzzlePress..."
Write-Host "App: $url"
Write-Host "Log: $logPath"
Write-Host "Server output: $serverOutPath"
Write-Host "Server errors: $serverErrPath"
Write-Host ""
Write-LaunchLog "Launcher started."

try {
  $npmCommand = Get-NpmCommand
  Stop-LocalPort -Port $port

  for ($attempt = 1; $attempt -le 3; $attempt++) {
    Write-Host "Starting local server, attempt $attempt..."
    $server = Start-PuzzlePressServer -NpmCommand $npmCommand

    if (Wait-ForServer -Process $server) {
      Write-Host "PuzzlePress is ready. Opening browser..."
      Write-LaunchLog "Server ready at $url."
      Start-Process $url
      Write-Host ""
      Write-Host "PuzzlePress is running. Keep this window open while using the app."
      Write-Host "Press Ctrl+C to stop the launcher. Closing this window may leave the server running in the background."
      Wait-Process -Id $server.Id
      Write-LaunchLog "Server process $($server.Id) exited."
      break
    }

    Write-LaunchLog "Server attempt $attempt did not become ready."
    if (-not $server.HasExited) {
      Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
  }
} catch {
  Write-Host ""
  Write-Host "PuzzlePress could not start:"
  Write-Host $_.Exception.Message
  Write-LaunchLog "Launcher error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "If the app did not open, review the log at:"
Write-Host $logPath
Write-Host "Also review:"
Write-Host $serverOutPath
Write-Host $serverErrPath
Read-Host "Press Enter to close"
