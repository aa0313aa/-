# 관리자 로그인 및 /api/admin/posts 검증 스크립트 (PowerShell)
# 사용법: PowerShell에서 이 파일을 실행하세요: .\admin-check.ps1
# 필요: 서버가 http://localhost:4000 에서 실행 중이어야 합니다.

$base = "http://localhost:4000"
$nickname = "aa0313"
$password = $env:ADMIN_PASS
if (-not $password) { $password = "admin" }

Write-Host "로그인 시도: $nickname @ $base"
$body = @{ nickname = $nickname; password = $password } | ConvertTo-Json

# 로그인 요청 (세션 쿠키를 파일에 저장)
$cookieJar = New-Object System.Net.CookieContainer
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.UseCookies = $true
$handler.CookieContainer = $cookieJar
$client = New-Object System.Net.Http.HttpClient($handler)

$req = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, 'application/json')
$resp = $client.PostAsync("$base/api/login", $req).Result
$txt = $resp.Content.ReadAsStringAsync().Result
Write-Host "응답(status): $($resp.StatusCode)"
Write-Host "응답(body): $txt"

if ($resp.IsSuccessStatusCode) {
  Write-Host "로그인 성공, 관리자 전용 포스트 목록 조회 중..."
  $resp2 = $client.GetAsync("$base/api/admin/posts").Result
  $txt2 = $resp2.Content.ReadAsStringAsync().Result
  Write-Host "admin/posts status: $($resp2.StatusCode)"
  Write-Host $txt2
} else {
  Write-Host "로그인 실패 — 비밀번호를 확인하세요. 환경변수 ADMIN_PASS가 설정되어 있으면 해당 값을 사용합니다."
}
