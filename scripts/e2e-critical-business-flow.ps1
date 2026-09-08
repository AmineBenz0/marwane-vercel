param(
    [string]$BaseUrl = 'http://127.0.0.1:8001/api/v1',
    [string]$Email = '',
    [string]$Password = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw 'Provide -Email and -Password explicitly; credentials are never supplied by source defaults.'
}

function To-JsonBody($obj) {
    $obj | ConvertTo-Json -Depth 12
}

function Api($method, $path, $body = $null) {
    $params = @{
        Method  = $method
        Uri     = "$BaseUrl$path"
        Headers = $script:Headers
    }

    if ($null -ne $body) {
        $params.ContentType = 'application/json'
        $params.Body = To-JsonBody $body
    }

    Invoke-RestMethod @params
}

function AsList($value) {
    if ($null -eq $value) { return @() }
    @($value | Where-Object { $null -ne $_ })
}

function D($value) {
    if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) {
        return [decimal]0
    }

    [decimal]::Parse([string]$value, [Globalization.CultureInfo]::InvariantCulture)
}

function Pass($name, $detail = '') {
    $script:Results += [pscustomobject]@{
        Check  = $name
        Result = 'PASS'
        Detail = $detail
    }
}

function Fail($name, $detail = '') {
    $script:Results += [pscustomobject]@{
        Check  = $name
        Result = 'FAIL'
        Detail = $detail
    }
    $script:Failures += 1
}

function AssertEq($name, [decimal]$actual, [decimal]$expected) {
    if ([math]::Abs($actual - $expected) -lt 0.01) {
        Pass $name "actual=$actual expected=$expected"
    } else {
        Fail $name "actual=$actual expected=$expected"
    }
}

function AssertTrue($name, [bool]$condition, $detail = '') {
    if ($condition) {
        Pass $name $detail
    } else {
        Fail $name $detail
    }
}

$script:Results = @()
$script:Failures = 0

$loginBody = @{
    email        = $Email
    mot_de_passe = $Password
}

$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' -Body (To-JsonBody $loginBody)
$script:Headers = @{ Authorization = "Bearer $($login.access_token)" }
Pass 'Login API' "$Email authenticated"

$suffix = (Get-Date).ToString('yyyyMMdd-HHmmss')
$today = (Get-Date).ToString('yyyy-MM-dd')

$client = Api Post '/clients' @{
    nom_client = "E2E Client LC $suffix"
    est_actif  = $true
}

$fournisseur = Api Post '/fournisseurs' @{
    nom_fournisseur = "E2E Fournisseur LC $suffix"
    est_actif       = $true
}

$compte = Api Post '/comptes-bancaires' @{
    nom_banque    = "E2E Banque $suffix"
    numero_compte = "E2E-$suffix"
    solde_initial = 0
}

Pass 'Test data created' "client=$($client.id_client), fournisseur=$($fournisseur.id_fournisseur), compte=$($compte.id_compte)"

$baselineSolde = Api Get '/caisse/solde/complet'
$baselineTotal = D $baselineSolde.solde_reel
Pass 'Baseline captured' "caisse=$baselineTotal"

$amountBank = [decimal]1234
$lcBank = Api Post '/lettres-credit' @{
    numero_reference   = "E2E-BANK-$suffix"
    numero_serie       = "BANK-$suffix"
    banque_emettrice   = 'E2E Test Bank'
    montant            = $amountBank
    date_emission      = $today
    date_disponibilite = $today
    id_client          = $client.id_client
    notes              = 'E2E: LC counted in caisse, then deposited to bank'
}

$afterCreateSolde = Api Get '/caisse/solde/complet'
$afterCreateTotal = D $afterCreateSolde.solde_reel
$afterCreateLcList = AsList (Api Get '/lettres-credit/disponibles')
$createdLcAvailable = @($afterCreateLcList | Where-Object { $_.id_lc -eq $lcBank.id_lc }).Count -eq 1

AssertTrue 'LC created is available' $createdLcAvailable "lc=$($lcBank.id_lc)"
AssertEq 'Caisse includes newly available LC' $afterCreateTotal ($baselineTotal + $amountBank)

$null = Api Post "/lettres-credit/$($lcBank.id_lc)/verser-banque" @{
    id_compte = $compte.id_compte
    notes     = 'E2E deposit to bank'
}

$lcBankAfter = Api Get "/lettres-credit/$($lcBank.id_lc)"
$afterDepositSolde = Api Get '/caisse/solde/complet'
$afterDepositTotal = D $afterDepositSolde.solde_reel
$accounts = AsList (Api Get '/comptes-bancaires')
$compteAfterDeposit = $accounts | Where-Object { $_.id_compte -eq $compte.id_compte } | Select-Object -First 1
$bankBalance = D $compteAfterDeposit.solde_actuel
$bankMovements = AsList (Api Get "/comptes-bancaires/$($compte.id_compte)/mouvements")
$hasLcBankMovement = @(
    $bankMovements | Where-Object {
        $_.source -eq 'lc' -and
        $_.reference -eq $lcBank.numero_reference -and
        (D $_.montant) -eq $amountBank
    }
).Count -ge 1

AssertTrue 'Deposited LC status becomes used' ($lcBankAfter.statut -eq 'utilisee') "statut=$($lcBankAfter.statut)"
AssertEq 'Deposited LC removed from Caisse availability' $afterDepositTotal $baselineTotal
AssertEq 'Bank balance increased by deposited LC' $bankBalance $amountBank
AssertTrue 'Bank movement created for LC deposit' $hasLcBankMovement "reference=$($lcBank.numero_reference)"

$amountSupplier = [decimal]777
$lcSupplier = Api Post '/lettres-credit' @{
    numero_reference   = "E2E-SUP-$suffix"
    numero_serie       = "SUP-$suffix"
    banque_emettrice   = 'E2E Test Bank'
    montant            = $amountSupplier
    date_emission      = $today
    date_disponibilite = $today
    id_client          = $client.id_client
    notes              = 'E2E: LC counted in caisse, then paid to supplier'
}

$afterSupplierCreateSolde = Api Get '/caisse/solde/complet'
AssertEq 'Second LC adds to Caisse while available' (D $afterSupplierCreateSolde.solde_reel) ($baselineTotal + $amountSupplier)

$null = Api Post "/lettres-credit/$($lcSupplier.id_lc)/payer-fournisseur" @{
    id_fournisseur = $fournisseur.id_fournisseur
    date_cession   = $today
    notes          = 'E2E supplier payment with LC'
}

$lcSupplierAfter = Api Get "/lettres-credit/$($lcSupplier.id_lc)"
$afterSupplierPaymentSolde = Api Get '/caisse/solde/complet'
$cessions = AsList (Api Get '/cessions-lc')
$hasCession = @(
    $cessions | Where-Object {
        $_.id_lc -eq $lcSupplier.id_lc -or
        $_.numero_reference_lc -eq $lcSupplier.numero_reference
    }
).Count -ge 1

AssertTrue 'Supplier-paid LC status becomes used' ($lcSupplierAfter.statut -eq 'utilisee') "statut=$($lcSupplierAfter.statut)"
AssertEq 'Supplier-paid LC removed from Caisse availability' (D $afterSupplierPaymentSolde.solde_reel) $baselineTotal
AssertTrue 'Cession/history exists for supplier LC payment' $hasCession "lc=$($lcSupplier.id_lc)"

try {
    $headersText = & curl.exe -s -D - -o NUL `
        -H 'Origin: http://localhost:5173' `
        -H "Authorization: Bearer $($login.access_token)" `
        "$BaseUrl/caisse/solde/complet"
    $originLine = ($headersText | Select-String -Pattern 'access-control-allow-origin' -CaseSensitive:$false | Select-Object -First 1).Line
    AssertTrue 'CORS header present for frontend origin' ([bool]$originLine) $originLine
} catch {
    Fail 'CORS header present for frontend origin' $_.Exception.Message
}

$summary = [pscustomobject]@{
    suffix          = $suffix
    baseline_caisse = "$baselineTotal"
    created         = [pscustomobject]@{
        client                  = $client.id_client
        fournisseur             = $fournisseur.id_fournisseur
        compte_bancaire         = $compte.id_compte
        lc_depot_banque         = $lcBank.id_lc
        lc_paiement_fournisseur = $lcSupplier.id_lc
    }
    checks          = $script:Results
    failures        = $script:Failures
}

$summary | ConvertTo-Json -Depth 10

if ($script:Failures -gt 0) {
    exit 1
}
