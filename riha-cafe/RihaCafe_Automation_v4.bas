Attribute VB_Name = "RihaCafe_Automation_v4"
Option Explicit
' =====================================================================
' Riha Cafe v4 - helper macros (ASCII-only source: safe to import)
' v4: nothing depends on column numbers, row numbers or sheet positions.
'   * tables are found by NAME (tblSales, tblMenu, ...) on any sheet
'   * columns are found by HEADER TEXT (so inserting/moving columns is safe)
'   * sheets used are found by NAME (invoice sheet, hidden calendar sheet)
'   * dates are written as Jalali text (yyyy/mm/dd) from the calendar sheet
' Import: Alt+F11 > File > Import File, then save the workbook as .xlsm
' v4.1: macros are OPTIONAL. The workbook numbers invoices by formula
'   (column "day invoice no." -> R-yyyymmdd-NN), so it works without
'   macros in Excel for the web / mobile. These macros only save typing
'   and never write into the calculated invoice-number column.
' =====================================================================
Private Const INV_CELL As String = "B4"      ' printed number (formula)
Private Const PICK_CELL As String = "I3"     ' invoice picker (empty = latest)

Private Function U(ByVal hexList As String) As String
    Dim p As Variant, s As String
    For Each p In Split(hexList, " ")
        If Len(p) > 0 Then s = s & ChrW(CLng("&H" & p))
    Next p
    U = s
End Function

Private Function N_DATE() As String
    N_DATE = U("062A 0627 0631 06CC 062E")   ' DATE
End Function

Private Function N_INV() As String
    N_INV = U("0634 0645 0627 0631 0647 0020 0641 0627 06A9 062A 0648 0631")   ' INV
End Function

Private Function N_DAYNO() As String
    N_DAYNO = U("0641 0627 06A9 062A 0648 0631 0020 0631 0648 0632")   ' DAYNO (calc INV is built from DATE + DAYNO)
End Function

Private Function N_PNAME() As String
    N_PNAME = U("0646 0627 0645 0020 0645 062D 0635 0648 0644")   ' PNAME (picked from a list; code is calculated)
End Function

Private Function N_PROD() As String
    N_PROD = U("06A9 062F 0020 0645 062D 0635 0648 0644")   ' PROD
End Function

Private Function N_PAY() As String
    N_PAY = U("0631 0648 0634 0020 067E 0631 062F 0627 062E 062A")   ' PAY
End Function

Private Function N_STAT() As String
    N_STAT = U("0648 0636 0639 06CC 062A")   ' STAT
End Function

Private Function N_STAFF() As String
    N_STAFF = U("06A9 062F 0020 067E 0631 0633 0646 0644")   ' STAFF
End Function

Private Function N_TIME() As String
    N_TIME = U("0633 0627 0639 062A")   ' TIME
End Function

Private Function N_TABLE() As String
    N_TABLE = U("0645 06CC 0632 002F 0633 0641 0627 0631 0634")   ' TABLE
End Function

Private Function N_CUST() As String
    N_CUST = U("0646 0627 0645 0020 0645 0634 062A 0631 06CC")   ' CUST
End Function

Private Function N_PHONE() As String
    N_PHONE = U("062A 0644 0641 0646")   ' PHONE
End Function

Private Function N_ING() As String
    N_ING = U("06A9 062F 0020 0645 0627 062F 0647")   ' ING
End Function

Private Function N_SUP() As String
    N_SUP = U("06A9 062F 0020 062A 0623 0645 06CC 0646 200C 06A9 0646 0646 062F 0647")   ' SUP
End Function

Private Function N_FINAL() As String
    N_FINAL = U("0646 0647 0627 06CC 06CC")   ' FINAL
End Function

Private Function N_S_INV() As String
    N_S_INV = U("0641 0627 06A9 062A 0648 0631")   ' S_INV
End Function

Private Function N_S_CAL() As String
    N_S_CAL = U("062A 0642 0648 06CC 0645")   ' S_CAL
End Function

' ---- lookup helpers ---------------------------------------------------
Private Function FindTable(ByVal nm As String) As ListObject
    Dim ws As Worksheet, lo As ListObject
    For Each ws In ThisWorkbook.Worksheets
        For Each lo In ws.ListObjects
            If lo.Name = nm Then Set FindTable = lo: Exit Function
        Next lo
    Next ws
End Function

Private Function ColIdx(lo As ListObject, ByVal hdr As String) As Long
    Dim c As ListColumn
    For Each c In lo.ListColumns
        If c.Name = hdr Then ColIdx = c.Index: Exit Function
    Next c
End Function

Private Sub PutCell(r As ListRow, ByVal hdr As String, ByVal v As Variant)
    Dim i As Long
    i = ColIdx(r.Parent, hdr)
    If i > 0 Then r.Range.Cells(1, i).Value = v
End Sub

Private Function GetCell(r As Range, lo As ListObject, ByVal hdr As String) As Variant
    Dim i As Long
    i = ColIdx(lo, hdr)
    If i > 0 Then GetCell = r.Cells(1, i).Value
End Function

Private Function JalaliText(ByVal d As Date) As String
    Dim ws As Worksheet, m As Variant
    Set ws = ThisWorkbook.Worksheets(N_S_CAL())
    m = Application.Match(CLng(d), ws.Range("B:B"), 0)
    If IsError(m) Then JalaliText = Format(d, "yyyy/mm/dd") Else JalaliText = CStr(ws.Cells(CLng(m), 3).Value)
End Function

Private Function TableAtCursor() As ListObject
    Dim lo As ListObject
    On Error Resume Next
    Set lo = ActiveCell.ListObject
    On Error GoTo 0
    Set TableAtCursor = lo
End Function

Private Function SalesTable() As ListObject
    Set SalesTable = FindTable("tblSales")
    If SalesTable Is Nothing Then MsgBox "Table tblSales was not found.", vbExclamation
End Function

' ---- generic row tools (work on any table) ----------------------------
Public Sub AddRowToActiveTable()
    Dim lo As ListObject, r As ListRow
    Set lo = TableAtCursor()
    If lo Is Nothing Then MsgBox "Click inside a table first.", vbInformation: Exit Sub
    Set r = lo.ListRows.Add
    r.Range.Cells(1, 1).Select
End Sub

Private Function UsageCount(ByVal tbl As String, ByVal hdr As String, ByVal code As String) As Long
    Dim lo As ListObject, i As Long
    Set lo = FindTable(tbl)
    If lo Is Nothing Then Exit Function
    i = ColIdx(lo, hdr)
    If i = 0 Then Exit Function
    If lo.ListRows.Count = 0 Then Exit Function
    UsageCount = Application.WorksheetFunction.CountIf(lo.ListColumns(i).DataBodyRange, code)
End Function

Private Function UsedElsewhere(lo As ListObject, ByVal code As String) As Long
    Select Case lo.Name
        Case "tblMenu"
            UsedElsewhere = UsageCount("tblSales", N_PROD(), code) + UsageCount("tblRecipe", N_PROD(), code)
        Case "tblIngredients"
            UsedElsewhere = UsageCount("tblStockLog", N_ING(), code) + UsageCount("tblRecipe", N_ING(), code)
        Case "tblStaff"
            UsedElsewhere = UsageCount("tblSales", N_STAFF(), code) + UsageCount("tblAttendance", N_STAFF(), code) + UsageCount("tblPayroll", N_STAFF(), code)
        Case "tblSuppliers"
            UsedElsewhere = UsageCount("tblStockLog", N_SUP(), code) + UsageCount("tblIngredients", N_SUP(), code)
    End Select
End Function

Public Sub DeleteActiveTableRow()
    Dim lo As ListObject, idx As Long, code As String, n As Long, msg As String
    Set lo = TableAtCursor()
    If lo Is Nothing Then MsgBox "Click inside a table first.", vbInformation: Exit Sub
    If Intersect(ActiveCell, lo.DataBodyRange) Is Nothing Then
        MsgBox "Select a cell in a data row.", vbInformation: Exit Sub
    End If
    idx = ActiveCell.Row - lo.DataBodyRange.Row + 1
    code = CStr(lo.DataBodyRange.Cells(idx, 1).Value)
    msg = "Delete the selected row from " & lo.Name & "?"
    If Len(code) > 0 Then
        n = UsedElsewhere(lo, code)
        If n > 0 Then msg = "Code " & code & " is used in " & n & " other row(s). Deleting it will mark them invalid." & vbCrLf & vbCrLf & "Delete anyway?"
    End If
    If MsgBox(msg, vbYesNo + vbQuestion) <> vbYes Then Exit Sub
    If lo.ListRows.Count = 1 Then
        lo.DataBodyRange.ClearContents      ' a table keeps one (empty) row
    Else
        lo.ListRows(idx).Delete
    End If
End Sub

' ---- sales entry --------------------------------------------------------
Private Function LastInvoiceNo() As String
    Dim lo As ListObject, n As Long, i As Long, v As String
    Set lo = SalesTable()
    If lo Is Nothing Then Exit Function
    i = ColIdx(lo, N_INV())
    If i = 0 Or lo.ListRows.Count = 0 Then Exit Function
    For n = lo.ListRows.Count To 1 Step -1
        v = CStr(lo.DataBodyRange.Cells(n, i).Value)
        If Len(v) > 0 Then LastInvoiceNo = v: Exit Function
    Next n
End Function

Private Function NextDayNo(ByVal dayText As String) As Long
    ' highest "day invoice no." already used on dayText, plus one
    Dim lo As ListObject, n As Long, iD As Long, iN As Long, mx As Long
    Set lo = SalesTable()
    If lo Is Nothing Then Exit Function
    iD = ColIdx(lo, N_DATE()): iN = ColIdx(lo, N_DAYNO())
    If iD > 0 And iN > 0 And lo.ListRows.Count > 0 Then
        For n = 1 To lo.ListRows.Count
            If CStr(lo.DataBodyRange.Cells(n, iD).Value) = dayText Then
                If Val(lo.DataBodyRange.Cells(n, iN).Value) > mx Then mx = Val(lo.DataBodyRange.Cells(n, iN).Value)
            End If
        Next n
    End If
    NextDayNo = mx + 1
End Function

Private Sub AppendSaleLine(ByVal dayText As String, ByVal dayNo As Long, ByVal copyFromLast As Boolean)
    Dim lo As ListObject, r As ListRow, prev As Range, k As Variant
    Set lo = SalesTable()
    If lo Is Nothing Then Exit Sub
    If copyFromLast And lo.ListRows.Count > 0 Then Set prev = lo.DataBodyRange.Rows(lo.ListRows.Count)
    Set r = lo.ListRows.Add
    PutCell r, N_DATE(), dayText
    PutCell r, N_DAYNO(), dayNo
    PutCell r, N_STAT(), N_FINAL()
    PutCell r, N_TIME(), TimeSerial(Hour(Now), Minute(Now), 0)
    If Not prev Is Nothing Then
        For Each k In Array(N_PAY(), N_STAFF(), N_TABLE(), N_CUST(), N_PHONE())
            PutCell r, CStr(k), GetCell(prev, lo, CStr(k))
        Next k
    End If
    lo.Parent.Activate
    If ColIdx(lo, N_PNAME()) > 0 Then r.Range.Cells(1, ColIdx(lo, N_PNAME())).Select
End Sub

Public Sub NewInvoice()
    Dim j As String
    j = JalaliText(Date)
    AppendSaleLine j, NextDayNo(j), False
End Sub

Public Sub NewSaleLine()
    ' next line of the invoice in the last row (same date and day number)
    Dim lo As ListObject, last As Range, d As String, n As Long
    Set lo = SalesTable()
    If lo Is Nothing Then Exit Sub
    If lo.ListRows.Count > 0 Then
        Set last = lo.DataBodyRange.Rows(lo.ListRows.Count)
        d = CStr(GetCell(last, lo, N_DATE()))
        n = Val(GetCell(last, lo, N_DAYNO()))
    End If
    If Len(d) = 0 Or n = 0 Then NewInvoice: Exit Sub
    AppendSaleLine d, n, True
End Sub

' ---- invoice sheet -------------------------------------------------------
Private Function InvSheet() As Worksheet
    On Error Resume Next
    Set InvSheet = ThisWorkbook.Worksheets(N_S_INV())
    On Error GoTo 0
    If InvSheet Is Nothing Then MsgBox "Invoice sheet was not found.", vbExclamation
End Function

Public Sub ShowLastInvoice()
    Dim ws As Worksheet
    Set ws = InvSheet()
    If ws Is Nothing Then Exit Sub
    ws.Range(PICK_CELL).ClearContents          ' empty picker = latest invoice (by formula)
    ws.Activate
End Sub

Private Function SafeName(ByVal s As String) As String
    Dim c As Variant
    For Each c In Array("\", "/", ":", "*", "?", """", "<", ">", "|")
        s = Replace(s, c, "_")
    Next c
    SafeName = s
End Function

Public Sub PrintInvoice()
    Dim ws As Worksheet
    Set ws = InvSheet()
    If ws Is Nothing Then Exit Sub
    If Len(CStr(ws.Range(INV_CELL).Value)) = 0 Then
        MsgBox "Select an invoice number in " & INV_CELL & " first.", vbInformation: Exit Sub
    End If
    ws.PrintOut Copies:=1
End Sub

Public Sub ExportInvoicePDF()
    Dim ws As Worksheet, f As String
    Set ws = InvSheet()
    If ws Is Nothing Then Exit Sub
    If Len(CStr(ws.Range(INV_CELL).Value)) = 0 Then
        MsgBox "Select an invoice number in " & INV_CELL & " first.", vbInformation: Exit Sub
    End If
    If Len(ThisWorkbook.Path) = 0 Then MsgBox "Save the workbook first.", vbInformation: Exit Sub
    f = ThisWorkbook.Path & Application.PathSeparator & "Invoice_" & SafeName(CStr(ws.Range(INV_CELL).Value)) & ".pdf"
    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=f, Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=True
End Sub

' ---- maintenance -----------------------------------------------------------
Public Sub BackupWorkbook()
    Dim p As String, nm As String, ext As String, dot As Long
    If Len(ThisWorkbook.Path) = 0 Then MsgBox "Save the workbook first.", vbInformation: Exit Sub
    dot = InStrRev(ThisWorkbook.Name, ".")
    nm = Left$(ThisWorkbook.Name, dot - 1)
    ext = Mid$(ThisWorkbook.Name, dot)
    p = ThisWorkbook.Path & Application.PathSeparator & "Backup"
    If Dir(p, vbDirectory) = "" Then MkDir p
    ThisWorkbook.SaveCopyAs p & Application.PathSeparator & nm & "_" & Format(Now, "yyyymmdd_hhnn") & ext
    MsgBox "Backup saved in the Backup folder.", vbInformation
End Sub

Public Sub RecalculateAll()
    Application.CalculateFull
End Sub
