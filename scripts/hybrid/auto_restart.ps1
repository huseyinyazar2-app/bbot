$trainProcess = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%train_model.py%'"
while ($trainProcess) {
    Start-Sleep -Seconds 5
    $trainProcess = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%train_model.py%'"
}
$inferenceProcess = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%inference_server.py%'"
if ($inferenceProcess) {
    Stop-Process -Id $inferenceProcess.ProcessId -Force
}
Start-Sleep -Seconds 2
python scripts\hybrid\inference_server.py
