# SWVA Traffic Watch Windows server (no Python)
param([int]$Port = 8766)
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$Root = $PSScriptRoot
$Prefix = 'http://127.0.0.1:' + [string]$Port + '/'
$Listener = [System.Net.HttpListener]::new()
$Listener.Prefixes.Add($Prefix)
try {
  $Listener.Start()
} catch {
  Write-Host 'Could not bind port. Close the other SWVA Traffic Watch window first.'
  Write-Host $_
  exit 1
}
Write-Host ('SWVA Traffic Watch  ' + $Prefix)
Write-Host 'Ctrl+C to stop.'
Start-Process $Prefix

function Send-Bytes($ctx, [int]$status, [string]$contentType, [byte[]]$bytes) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = $contentType
  $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.OutputStream.Close()
}
function Send-Text($ctx, [int]$status, [string]$contentType, [string]$text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  Send-Bytes $ctx $status $contentType $bytes
}
$Mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.svg'  = 'image/svg+xml'
  '.md'   = 'text/plain; charset=utf-8'
}
$CamsUrl = 'https://511.vdot.virginia.gov/services/map/layers/map/cams'

while ($Listener.IsListening) {
  $ctx = $Listener.GetContext()
  $req = $ctx.Request
  $path = $req.Url.AbsolutePath
  try {
    if ($req.HttpMethod -eq 'OPTIONS') {
      $ctx.Response.StatusCode = 204
      $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
      $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, OPTIONS')
      $ctx.Response.Close()
      continue
    }
    if ($path -eq '/proxy/health') {
      Send-Text $ctx 200 'application/json' '{"ok":true,"service":"swva-511-cams"}'
      continue
    }
    if ($path -eq '/proxy/cams') {
      try {
        $resp = Invoke-WebRequest -Uri $CamsUrl -UseBasicParsing -TimeoutSec 30 -UserAgent 'SWVA511Cams/1.0'
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300 -and $resp.Content) {
          Send-Text $ctx 200 'application/json' ([string]$resp.Content)
        } else {
          Send-Text $ctx 502 'application/json' '{"error":"VDOT cams upstream failed"}'
        }
      } catch {
        Send-Text $ctx 502 'application/json' '{"error":"VDOT cams upstream failed"}'
      }
      continue
    }
    if ($path -eq '/') { $path = '/index.html' }
    $rel = $path.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ($rel.Contains('..')) {
      Send-Text $ctx 400 'text/plain' 'bad path'
      continue
    }
    $file = Join-Path $Root $rel
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      Send-Text $ctx 404 'text/plain' 'not found'
      continue
    }
    $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
    $ctype = $Mime[$ext]
    if (-not $ctype) { $ctype = 'application/octet-stream' }
    $bytes = [IO.File]::ReadAllBytes($file)
    Send-Bytes $ctx 200 $ctype $bytes
  } catch {
    try { Send-Text $ctx 500 'text/plain' 'error' } catch {}
  }
}
