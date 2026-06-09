strCommand = "python E:\dd\Documents\hanako\Health\server.py 8083"
Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
Set objStartup = objWMIService.Get("Win32_ProcessStartup")
Set objProcess = objWMIService.Get("Win32_Process")
intReturn = objProcess.Create(strCommand, null, objStartup, intProcessID)
If intReturn = 0 Then
   CreateObject("Scripting.FileSystemObject").OpenTextFile("E:\dd\Documents\hanako\Health\.pid", 2, True).WriteLine intProcessID
End If
