Attribute VB_Name = "RihaCafe_OrderForm"
Option Explicit
' =====================================================================
' Riha Cafe - order form sheet -> rows in tblSales.
' Source template: make_order_form.py turns each Persian FA-literal into
' U("hex ..."), because the VBA editor stores code in an ANSI code page.
' Cell addresses must match the "order form" block in build_riha_cafe_v4.py.
' =====================================================================
Private Const FIRST_ITEM As Long = 11
Private Const LAST_ITEM As Long = 24
Private Const SALES_HEADER_ROW As Long = 5     ' header row of tblSales (fallback when ListObject is unavailable)

Private Function U(ByVal hexList As String) As String
    Dim p As Variant, s As String
    For Each p In Split(hexList, " ")
        If Len(p) > 0 Then s = s & ChrW(CLng("&H" & p))
    Next p
    U = s
End Function

Private Function SheetByName(ByVal nm As String) As Worksheet
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name = nm Then Set SheetByName = ws: Exit Function
    Next ws
End Function

Private Function FormSheet() As Worksheet
    Set FormSheet = SheetByName(U("062B 0628 062A 0020 0633 0641 0627 0631 0634"))
End Function

Private Function SalesSheet() As Worksheet
    Set SalesSheet = SheetByName(U("0641 0631 0648 0634"))
End Function

Private Function InvoiceSheet() As Worksheet
    Set InvoiceSheet = SheetByName(U("0641 0627 06A9 062A 0648 0631"))
End Function

Private Sub Say(ByVal msg As String, ByVal ok As Boolean)
    Dim ws As Worksheet
    Set ws = FormSheet()
    If ws Is Nothing Then Exit Sub
    ws.Range("A30").Value = msg
    If ok Then
        ws.Range("A30").Interior.Color = RGB(214, 238, 222)
    Else
        ws.Range("A30").Interior.Color = RGB(249, 214, 214)
    End If
End Sub

' ---- tblSales access: ListObject in Excel, plain rows as a fallback -------
Private Function SalesTable() As Object
    Dim ws As Worksheet, lo As Object
    Set ws = SalesSheet()
    If ws Is Nothing Then Exit Function
    On Error Resume Next
    Set lo = ws.ListObjects("tblSales")
    On Error GoTo 0
    Set SalesTable = lo
End Function

Private Function HeaderRow() As Range
    Dim lo As Object, ws As Worksheet, c As Long
    Set lo = SalesTable()
    If Not lo Is Nothing Then Set HeaderRow = lo.HeaderRowRange: Exit Function
    Set ws = SalesSheet()
    c = 1
    Do While Len(CStr(ws.Cells(SALES_HEADER_ROW, c + 1).Value)) > 0
        c = c + 1
    Loop
    Set HeaderRow = ws.Range(ws.Cells(SALES_HEADER_ROW, 1), ws.Cells(SALES_HEADER_ROW, c))
End Function

Private Function ColOf(hdr As Range, ByVal nm As String) As Long
    Dim i As Long
    For i = 1 To hdr.Columns.Count
        If CStr(hdr.Cells(1, i).Value) = nm Then ColOf = i: Exit Function
    Next i
End Function

Private Function IsBlankRow(rw As Range, ByVal cDate As Long, ByVal cName As Long) As Boolean
    IsBlankRow = Len(CStr(rw.Cells(1, cDate).Value)) = 0 And Len(CStr(rw.Cells(1, cName).Value)) = 0
End Function

' Row to write the next sale line into: the first of the empty rows at the end
' of the table, or a new table row.
Private Function NextSalesRow(hdr As Range, ByVal cDate As Long, ByVal cName As Long) As Range
    Dim lo As Object, n As Long, ws As Worksheet, r As Long
    Set lo = SalesTable()
    If Not lo Is Nothing Then
        n = lo.ListRows.Count
        Do While n > 0
            If Not IsBlankRow(lo.ListRows(n).Range, cDate, cName) Then Exit Do
            n = n - 1
        Loop
        If n < lo.ListRows.Count Then
            Set NextSalesRow = lo.ListRows(n + 1).Range
        Else
            Set NextSalesRow = lo.ListRows.Add.Range
        End If
        Exit Function
    End If
    Set ws = hdr.Worksheet
    r = hdr.Row + 1
    Do While Not IsBlankRow(ws.Range(ws.Cells(r, hdr.Column), ws.Cells(r, hdr.Column + hdr.Columns.Count - 1)), cDate, cName)
        r = r + 1
    Loop
    Set NextSalesRow = ws.Range(ws.Cells(r, hdr.Column), ws.Cells(r, hdr.Column + hdr.Columns.Count - 1))
End Function

Private Sub PutVal(rw As Range, hdr As Range, ByVal nm As String, ByVal v As Variant)
    Dim i As Long
    i = ColOf(hdr, nm)
    If i > 0 Then rw.Cells(1, i).Value = v
End Sub

' ---- buttons ------------------------------------------------------------
Public Sub RegisterOrder()
    DoRegister False
End Sub

Public Sub RegisterAndPrint()
    DoRegister True
End Sub

Public Sub ClearOrderForm()
    ClearForm
    Say U("0641 0631 0645 0020 067E 0627 06A9 0020 0634 062F 002E"), True
End Sub

Private Sub ClearForm()
    Dim ws As Worksheet
    Set ws = FormSheet()
    If ws Is Nothing Then Exit Sub
    ws.Range("B" & FIRST_ITEM & ":C" & LAST_ITEM).ClearContents
    ws.Range("B6:B7").ClearContents
    ws.Range("D4").MergeArea.ClearContents
    ws.Range("D6").Value = 0
    ws.Range("B5").Value = U("0646 0642 062F")
    ws.Range("B4").Formula = "=IFERROR(INDEX(CalText,MATCH(TODAY(),CalSerial,0)),"""")"
End Sub

Private Sub DoRegister(ByVal doPrint As Boolean)
    Dim ws As Worksheet, hdr As Range, rw As Range, inv As Worksheet
    Dim r As Long, n As Long, i As Long, dayNo As Long
    Dim cDate As Long, cName As Long
    Dim dayText As String, invNo As String, nm As String
    Dim names(1 To 14) As String, qtys(1 To 14) As Double
    Dim tm As Date, disc As Double

    Set ws = FormSheet()
    If ws Is Nothing Then Exit Sub
    Application.Calculate

    dayText = Trim$(CStr(ws.Range("B4").Value))
    If Len(dayText) = 0 Or Not IsNumeric(ws.Range("G4").Value) Then
        Say U("062A 0627 0631 06CC 062E 0020 062F 0631 0633 062A 0020 0646 06CC 0633 062A 002E 0020 0645 062B 0644 0020 0031 0034 0030 0035 002F 0030 0038 002F 0030 0034 0020 0628 0646 0648 06CC 0633 06CC 062F 002E"), False
        ws.Range("B4").Select
        Exit Sub
    End If

    For r = FIRST_ITEM To LAST_ITEM
        nm = Trim$(CStr(ws.Cells(r, 2).Value))
        If Len(nm) > 0 Then
            If Not IsNumeric(ws.Cells(r, 4).Value) Or Len(CStr(ws.Cells(r, 4).Value)) = 0 Then
                Say U("0631 062F 06CC 0641 0020") & (r - FIRST_ITEM + 1) & U("003A 0020 0627 06CC 0646 0020 0645 062D 0635 0648 0644 0020 062F 0631 0020 0645 0646 0648 0020 0646 06CC 0633 062A 002E 0020 0627 0632 0020 0641 0647 0631 0633 062A 0020 0627 0646 062A 062E 0627 0628 0020 06A9 0646 06CC 062F 002E"), False
                ws.Cells(r, 2).Select
                Exit Sub
            End If
            If Not IsNumeric(ws.Cells(r, 3).Value) Or Len(CStr(ws.Cells(r, 3).Value)) = 0 Then
                Say U("0631 062F 06CC 0641 0020") & (r - FIRST_ITEM + 1) & U("003A 0020 062A 0639 062F 0627 062F 0020 0631 0627 0020 0648 0627 0631 062F 0020 06A9 0646 06CC 062F 002E"), False
                ws.Cells(r, 3).Select
                Exit Sub
            End If
            If CDbl(ws.Cells(r, 3).Value) <= 0 Then
                Say U("0631 062F 06CC 0641 0020") & (r - FIRST_ITEM + 1) & U("003A 0020 062A 0639 062F 0627 062F 0020 0628 0627 06CC 062F 0020 0628 06CC 0634 062A 0631 0020 0627 0632 0020 0635 0641 0631 0020 0628 0627 0634 062F 002E"), False
                ws.Cells(r, 3).Select
                Exit Sub
            End If
            n = n + 1
            names(n) = nm
            qtys(n) = CDbl(ws.Cells(r, 3).Value)
        ElseIf Len(CStr(ws.Cells(r, 3).Value)) > 0 Then
            Say U("0631 062F 06CC 0641 0020") & (r - FIRST_ITEM + 1) & U("003A 0020 0646 0627 0645 0020 0645 062D 0635 0648 0644 0020 062E 0627 0644 06CC 0020 0627 0633 062A 002E"), False
            ws.Cells(r, 2).Select
            Exit Sub
        End If
    Next r
    If n = 0 Then
        Say U("0647 06CC 0686 0020 0642 0644 0645 06CC 0020 0648 0627 0631 062F 0020 0646 0634 062F 0647 0020 0627 0633 062A 002E 0020 0646 0627 0645 0020 0645 062D 0635 0648 0644 0020 0648 0020 062A 0639 062F 0627 062F 0020 0631 0627 0020 0628 0646 0648 06CC 0633 06CC 062F 002E"), False
        ws.Range("B" & FIRST_ITEM).Select
        Exit Sub
    End If

    Set hdr = HeaderRow()
    cDate = ColOf(hdr, U("062A 0627 0631 06CC 062E"))
    cName = ColOf(hdr, U("0646 0627 0645 0020 0645 062D 0635 0648 0644"))
    If cDate = 0 Or cName = 0 Then
        Say U("0633 062A 0648 0646 200C 0647 0627 06CC 0020 0634 06CC 062A 0020 0641 0631 0648 0634 0020 067E 06CC 062F 0627 0020 0646 0634 062F 002E 0020 0646 0627 0645 0020 0633 062A 0648 0646 200C 0647 0627 0020 0631 0627 0020 062A 063A 06CC 06CC 0631 0020 0646 062F 0627 062F 0647 0020 0628 0627 0634 06CC 062F 002E"), False
        Exit Sub
    End If

    dayNo = CLng(ws.Range("G5").Value)
    invNo = CStr(ws.Range("D7").Value)
    disc = 0
    If IsNumeric(ws.Range("D6").Value) Then disc = CDbl(ws.Range("D6").Value)
    tm = TimeSerial(Hour(Now), Minute(Now), 0)

    Application.ScreenUpdating = False
    For i = 1 To n
        Set rw = NextSalesRow(hdr, cDate, cName)
        rw.Cells(1, cDate).NumberFormat = "@"
        rw.Cells(1, cDate).Value = dayText
        PutVal rw, hdr, U("0641 0627 06A9 062A 0648 0631 0020 0631 0648 0632"), dayNo
        rw.Cells(1, cName).Value = names(i)
        PutVal rw, hdr, U("062A 0639 062F 0627 062F"), qtys(i)
        PutVal rw, hdr, U("062F 0631 0635 062F 0020 062A 062E 0641 06CC 0641"), disc
        PutVal rw, hdr, U("0631 0648 0634 0020 067E 0631 062F 0627 062E 062A"), CStr(ws.Range("B5").Value)
        PutVal rw, hdr, U("0648 0636 0639 06CC 062A"), U("0646 0647 0627 06CC 06CC")
        PutVal rw, hdr, U("06A9 062F 0020 067E 0631 0633 0646 0644"), CStr(ws.Range("D5").Value)
        PutVal rw, hdr, U("0633 0627 0639 062A"), tm
        PutVal rw, hdr, U("0645 06CC 0632 002F 0633 0641 0627 0631 0634"), ws.Range("B6").Value
        PutVal rw, hdr, U("0646 0627 0645 0020 0645 0634 062A 0631 06CC"), CStr(ws.Range("B7").Value)
        PutVal rw, hdr, U("062A 0644 0641 0646"), CStr(ws.Range("D4").Value)
    Next i
    Application.ScreenUpdating = True

    Set inv = InvoiceSheet()
    If Not inv Is Nothing Then inv.Range("I3").Value = invNo
    ClearForm
    Application.Calculate
    Say U("062B 0628 062A 0020 0634 062F 003A 0020 0641 0627 06A9 062A 0648 0631 0020") & invNo & U("0020 0628 0627 0020") & n & U("0020 0642 0644 0645 002E 0020 0628 0631 0627 06CC 0020 062F 06CC 062F 0646 0020 0622 0646 0020 0628 0647 0020 0634 06CC 062A 0020 00AB 0641 0627 06A9 062A 0648 0631 00BB 0020 0628 0631 0648 06CC 062F 002E"), True
    If doPrint And Not inv Is Nothing Then inv.PrintOut Copies:=1
End Sub
