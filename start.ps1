#requires -Version 5.1
<#
.SYNOPSIS
Lance la pile locale et vérifie les identifiants déjà persistés, sans modifier les données.
.EXAMPLE
.\start.ps1 -Monitoring -Build
.EXAMPLE
.\start.ps1 -CheckOnly -Monitoring
.EXAMPLE
.\start.ps1 -Mode demo -Build
#>
[CmdletBinding()]
param(
    [ValidateSet('full', 'demo')][string]$Mode = 'full',
    [switch]$Monitoring,
    [switch]$Auth,
    [switch]$Build,
    [switch]$CheckOnly,
    [switch]$WithoutBasemap,
    [string]$GraphFile,
    [ValidateRange(30, 1800)][int]$WaitTimeout = 240
)

$ErrorActionPreference = 'Stop'
# Les codes natifs sont traités explicitement pour lancer les diagnostics même après un échec de Compose.
$PSNativeCommandUseErrorActionPreference = $false
$taskSavedEnvironment = @{}
$taskEnvironmentNames = @('COMPOSE_PROFILES', 'SUPERVISION_PROFILE', 'ASSIGNMENT_GRAPH_FILE',
    'VITE_BASEMAP_URL', 'VITE_MOTORWAYS_URL', 'VITE_GLYPHS_URL', 'VITE_SPRITE_URL', 'PUBLIC_URL', 'KEYCLOAK_PUBLIC_URL')
foreach ($taskName in $taskEnvironmentNames) {
    $taskSavedEnvironment[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}

function Invoke-ComposeJson([string[]]$Arguments) {
    $taskOutput = & docker @script:taskCompose @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Configuration Docker Compose invalide. Vérifier compose.yaml, .env et les profils choisis.' }
    return (($taskOutput -join "`n") | ConvertFrom-Json)
}

function Get-RunningServices {
    $taskOutput = & docker @script:taskCompose ps --format json 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Impossible de lire les conteneurs du projet.' }
    $taskJson = ($taskOutput -join "`n").Trim()
    if (-not $taskJson) { return @() }
    if ($taskJson.StartsWith('[')) { return @($taskJson | ConvertFrom-Json) }
    return @($taskOutput | ForEach-Object { $_ | ConvertFrom-Json })
}

function Test-PersistedSecrets($Config, $Running) {
    $taskFailures = @()
    $taskPostgres = @($Running | Where-Object { $_.Service -eq 'postgres' -and $_.State -eq 'running' })
    if ($Mode -eq 'full' -and $taskPostgres.Count -gt 0) {
        # Mot de passe via stdin, jamais dans les arguments, la console ou une requête SQL.
        $taskPassword = [string]$Config.services.backend.environment.DATABASE_PASSWORD
        $taskProbe = 'IFS= read -r PGPASSWORD; export PGPASSWORD; export PGCONNECT_TIMEOUT=5; exec psql -h 127.0.0.1 -U supervision -d supervision -w -v ON_ERROR_STOP=1 -Atc "SELECT 1"'
        $taskPassword | & docker @script:taskCompose exec -T postgres sh -c $taskProbe 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            $taskFailures += 'PostgreSQL refuse le secret configuré, ou sa connexion TCP est indisponible. Un volume déjà initialisé conserve son ancien mot de passe. Remettre le secret existant dans .env ou suivre la récupération décrite dans docs/docker.md. Aucun volume ne doit être supprimé.'
        } else { Write-Host 'PostgreSQL : connexion avec le secret configuré validée.' }
    } elseif ($Mode -eq 'full') { Write-Host 'PostgreSQL arrêté ou absent : le secret sera vérifié après le démarrage.' }
    $taskGrafana = @($Running | Where-Object { $_.Service -eq 'grafana' -and $_.State -eq 'running' })
    if ($Monitoring -and $taskGrafana.Count -gt 0) {
        $taskPublication = @($taskGrafana[0].Publishers | Where-Object { $_.TargetPort -eq 3000 }) | Select-Object -First 1
        $taskPort = if ($taskPublication) { $taskPublication.PublishedPort } else { $Config.services.grafana.ports[0].published }
        $taskLogin = [string]$Config.services.grafana.environment.GF_SECURITY_ADMIN_USER
        $taskPassword = [string]$Config.services.grafana.environment.GF_SECURITY_ADMIN_PASSWORD
        $taskToken = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskLogin + ':' + $taskPassword))
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$taskPort/api/user" -Headers @{Authorization = "Basic $taskToken"} -TimeoutSec 10 | Out-Null
            Write-Host 'Grafana : identifiants configurés validés.'
        } catch {
            $taskStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($taskStatus -eq 401) {
                $taskFailures += 'Grafana refuse les identifiants configurés (401). Le volume conserve probablement un ancien mot de passe administrateur. Utiliser le secret existant ou la procédure de récupération de docs/docker.md ; le lanceur ne réinitialise aucun mot de passe.'
            } else { $taskFailures += 'Grafana ne répond pas au contrôle de connexion. Vérifier son état et ses journaux : docker compose logs --tail 50 grafana.' }
        }
    } elseif ($Monitoring) { Write-Host 'Grafana arrêté ou absent : les identifiants seront vérifiés après le démarrage.' }
    return $taskFailures
}

function Show-Urls($Config) {
    $taskFrontend = if ($Mode -eq 'demo') { $Config.services.frontend } else { $Config.services.'frontend-live' }
    Write-Host "Application : http://localhost:$($taskFrontend.ports[0].published)"
    if ($Mode -eq 'full') { Write-Host "API / santé : http://localhost:$($Config.services.backend.ports[0].published)/actuator/health" }
    if ($Monitoring) {
        Write-Host "Grafana : http://localhost:$($Config.services.grafana.ports[0].published) (admin ; secret GRAFANA_PASSWORD)"
        Write-Host "Prometheus : http://localhost:$($Config.services.prometheus.ports[0].published)"
        Write-Host "Alertmanager : http://localhost:$($Config.services.alertmanager.ports[0].published)"
    }
    if ($Auth) { Write-Host "Keycloak : http://localhost:$($Config.services.keycloak.ports[0].published)" }
    Write-Host 'Arrêt en conservant les données : docker compose down'
}

try {
    if ($Mode -eq 'demo' -and ($Monitoring -or $Auth -or $GraphFile)) {
        throw 'Le mode demo est exclusif avec Monitoring, Auth et GraphFile. Choisir le mode full pour ces options.'
    }
    if ($WithoutBasemap -and -not ($Build -or $CheckOnly)) {
        throw 'WithoutBasemap modifie les paramètres de compilation : ajouter -Build (ou utiliser -CheckOnly pour le diagnostic).'
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker est absent. Installer et démarrer Docker Desktop avant de relancer.' }
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Le moteur Docker est inaccessible. Démarrer Docker Desktop et vérifier le contexte Linux (docker context show).' }
    & docker compose version 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose est absent. Mettre à jour Docker Desktop.' }

    $taskEnvFile = Join-Path $PSScriptRoot '.env'
    if (-not (Test-Path -LiteralPath $taskEnvFile)) {
        if ($CheckOnly) {
            $taskEnvFile = Join-Path $PSScriptRoot '.env.example'
            Write-Host '.env absent : diagnostic avec .env.example, sans créer de fichier.'
        } else {
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot '.env.example') -Destination $taskEnvFile
            Write-Host '.env créé à partir du modèle ; les valeurs existantes ne sont jamais écrasées.'
        }
    }
    $taskProfiles = @($Mode)
    if ($Monitoring) { $taskProfiles += 'monitoring' }
    if ($Auth) {
        $taskProfiles += 'auth'
        $env:SUPERVISION_PROFILE = 'auth'
    }
    $env:COMPOSE_PROFILES = $taskProfiles -join ','
    if ($GraphFile) {
        $taskGraph = (Resolve-Path -LiteralPath $GraphFile).Path
        $taskGraphDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'cartographie/out/graph')) + [IO.Path]::DirectorySeparatorChar
        if (-not $taskGraph.StartsWith($taskGraphDirectory, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($taskGraph) -ne '.json') {
            throw 'GraphFile doit désigner un fichier JSON existant dans cartographie/out/graph.'
        }
        $env:ASSIGNMENT_GRAPH_FILE = '/app/graph/' + [IO.Path]::GetFileName($taskGraph)
    }
    if ($WithoutBasemap) {
        foreach ($taskName in @('VITE_BASEMAP_URL', 'VITE_MOTORWAYS_URL', 'VITE_GLYPHS_URL', 'VITE_SPRITE_URL')) {
            # Une chaîne d'espaces est conservée par Windows PowerShell, contrairement à une variable vide.
            [Environment]::SetEnvironmentVariable($taskName, ' ', 'Process')
        }
    }
    $script:taskCompose = @('compose', '--project-directory', $PSScriptRoot, '--file', (Join-Path $PSScriptRoot 'compose.yaml'), '--env-file', $taskEnvFile)
    $taskConfig = Invoke-ComposeJson -Arguments @('config', '--format', 'json')
    if ($Mode -eq 'full' -and $taskConfig.services.backend.environment.SPRING_PROFILES_ACTIVE -match '(^|,)auth(,|$)' -and -not $Auth) {
        throw "L'authentification est activée dans .env : ajouter -Auth pour démarrer aussi Keycloak."
    }
    if ($Auth) {
        # Les URL publiques doivent suivre les ports choisis, sauf configuration explicite dans .env ou l'environnement.
        $taskEnvLines = Get-Content -LiteralPath $taskEnvFile
        if (-not $taskSavedEnvironment['PUBLIC_URL'] -and -not ($taskEnvLines -match '^\s*PUBLIC_URL\s*=')) {
            $env:PUBLIC_URL = "http://localhost:$($taskConfig.services.'frontend-live'.ports[0].published)"
        }
        if (-not $taskSavedEnvironment['KEYCLOAK_PUBLIC_URL'] -and -not ($taskEnvLines -match '^\s*KEYCLOAK_PUBLIC_URL\s*=')) {
            $env:KEYCLOAK_PUBLIC_URL = "http://localhost:$($taskConfig.services.keycloak.ports[0].published)"
        }
        $taskConfig = Invoke-ComposeJson -Arguments @('config', '--format', 'json')
    }
    $taskRunning = @(Get-RunningServices)
    $taskListeners = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { $_.Port })
    foreach ($taskService in $taskConfig.services.PSObject.Properties) {
        foreach ($taskPort in @($taskService.Value.ports)) {
            if ($null -eq $taskPort) { continue }
            $taskPublished = [int]$taskPort.published
            $taskOwned = @($taskRunning | Where-Object {
                $_.Service -eq $taskService.Name -and $_.State -eq 'running' -and
                @($_.Publishers | Where-Object { $_.PublishedPort -eq $taskPublished }).Count -gt 0
            }).Count -gt 0
            if ($taskListeners -contains $taskPublished -and -not $taskOwned) {
                throw "Le port $taskPublished ($($taskService.Name)) est déjà occupé. Arrêter le service en conflit ou changer son port dans .env. Les modes demo et full ne peuvent pas partager le port frontend."
            }
        }
    }
    if ($Mode -eq 'full') {
        $taskGraphConfigured = [string]$taskConfig.services.backend.environment.ASSIGNMENT_GRAPH_FILE
        if ($taskGraphConfigured) {
            if (-not $taskGraphConfigured.StartsWith('/app/graph/') -or $taskGraphConfigured.Substring(11) -match '[/\\]' -or
                -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot ('cartographie/out/graph/' + $taskGraphConfigured.Substring(11))) -PathType Leaf)) {
                throw 'ASSIGNMENT_GRAPH_FILE ne correspond pas à un fichier existant monté depuis cartographie/out/graph.'
            }
        } else { Write-Host 'Tronçons estimés : désactivés. Option : -GraphFile cartographie/out/graph/graph-AAAAMMJJ.json.' }
        if (-not $WithoutBasemap -and -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'cartographie/out/tiles/france.pmtiles'))) {
            Write-Warning 'Fond local absent. Installer les tuiles (docs/docker.md) ou utiliser -WithoutBasemap -Build pour un fond neutre.'
        }
    }
    $taskSecretFailures = @(Test-PersistedSecrets $taskConfig $taskRunning)
    if ($taskSecretFailures.Count -gt 0) { throw ($taskSecretFailures -join "`n") }
    if ($CheckOnly) {
        Write-Host 'Diagnostic terminé ; aucun service, secret ou volume modifié.'
        Show-Urls $taskConfig
        exit 0
    }
    $taskUp = @('up', '-d', '--wait', '--wait-timeout', [string]$WaitTimeout)
    if ($Build) { $taskUp += '--build' }
    & docker @script:taskCompose @taskUp
    $taskUpExitCode = $LASTEXITCODE
    if ($taskUpExitCode -ne 0) {
        # Un volume arrêté peut révéler son ancien secret seulement après ce premier démarrage.
        # Ne pas laisser le code de retour des sondes masquer celui de Compose.
        try {
            $taskSecretFailures = @(Test-PersistedSecrets $taskConfig @(Get-RunningServices))
        } catch {
            $taskSecretFailures = @('Le diagnostic après démarrage est indisponible ; consulter les journaux des services.')
        }
        $taskFailure = "Démarrage incomplet (Compose : $taskUpExitCode). Consulter docker compose ps -a et docker compose logs --tail 80 backend. Relancer avec -CheckOnly ; aucune donnée n'a été supprimée."
        if ($taskSecretFailures.Count -gt 0) { $taskFailure = ($taskSecretFailures -join "`n") + "`n" + $taskFailure }
        throw $taskFailure
    }
    $taskSecretFailures = @(Test-PersistedSecrets $taskConfig @(Get-RunningServices))
    Show-Urls $taskConfig
    if ($taskSecretFailures.Count -gt 0) { throw ($taskSecretFailures -join "`n") }
    Write-Host 'Pile prête.'
} catch {
    Write-Host ('ÉCHEC : ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    foreach ($taskName in $taskEnvironmentNames) {
        [Environment]::SetEnvironmentVariable($taskName, $taskSavedEnvironment[$taskName], 'Process')
    }
}
