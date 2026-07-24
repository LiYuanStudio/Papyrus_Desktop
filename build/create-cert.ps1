# Create self-signed root CA and code signing certificate
# After running, manually install root-ca.cer to Trusted Root Certification Authorities

$certName = "Papyrus Self-Signed Root CA"
$codeCertName = "Papyrus Code Signing"
if ($env:CERTIFICATE_PASSWORD) {
    $password = ConvertTo-SecureString -String $env:CERTIFICATE_PASSWORD -Force -AsPlainText
} else {
    Write-Host "CERTIFICATE_PASSWORD environment variable not set." -ForegroundColor Yellow
    $password = Read-Host -AsSecureString "Enter certificate password"
}

# 1. Create root CA
Write-Host "Creating root CA..." -ForegroundColor Cyan
$rootCert = New-SelfSignedCertificate `
    -Subject "CN=$certName, O=Papyrus Team, C=CN" `
    -KeyAlgorithm RSA `
    -KeyLength 4096 `
    -KeyUsage CertSign, CRLSign `
    -KeyUsageProperty All `
    -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(10) `
    -FriendlyName $certName

Write-Host "Root CA Thumbprint: $($rootCert.Thumbprint)" -ForegroundColor Green

# 2. Export root certificate
$rootCerPath = "$env:USERPROFILE\.papyrus-certs\root-ca.cer"
Export-Certificate -Cert $rootCert -FilePath $rootCerPath -Type CERT | Out-Null
Write-Host "Root CA exported: $rootCerPath" -ForegroundColor Green

# 3. Create code signing certificate (signed by root)
Write-Host "Creating code signing certificate..." -ForegroundColor Cyan
$codeCert = New-SelfSignedCertificate `
    -Subject "CN=$codeCertName, O=Papyrus Team, C=CN" `
    -Signer $rootCert `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -KeyUsage DigitalSignature `
    -Type CodeSigningCert `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5) `
    -FriendlyName $codeCertName

Write-Host "Code signing cert Thumbprint: $($codeCert.Thumbprint)" -ForegroundColor Green

# 4. Export code signing certificate as PFX
$certDir = "$env:USERPROFILE\.papyrus-certs"
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}
$pfxPath = "$certDir\code-signing.pfx"
Export-PfxCertificate -Cert $codeCert -FilePath $pfxPath -Password $password | Out-Null
Write-Host "Code signing cert exported: $pfxPath" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Next Step: Install root-ca.cer to Trusted Root CA" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Method 1 - Manual:"
Write-Host "  1. Open $rootCerPath"
Write-Host "  2. Click 'Install Certificate...'"
Write-Host "  3. Select 'Local Machine' (or Current User)"
Write-Host "  4. Select 'Place all certificates in the following store'"
Write-Host "  5. Browse -> Trusted Root Certification Authorities"
Write-Host "  6. Finish"
Write-Host ""
Write-Host "Method 2 - Admin PowerShell:"
Write-Host "  certutil -addstore -f Root '$rootCerPath'"
Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Signing Config (for electron-builder):" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Certificate: $pfxPath"
Write-Host "Password: (from CERTIFICATE_PASSWORD environment variable)"
Write-Host ""
