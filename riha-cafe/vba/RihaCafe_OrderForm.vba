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
    Set FormSheet = SheetByName(FA("ثبت سفارش"))
End Function

Private Function SalesSheet() As Worksheet
    Set SalesSheet = SheetByName(FA("فروش"))
End Function

Private Function InvoiceSheet() As Worksheet
    Set InvoiceSheet = SheetByName(FA("فاکتور"))
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
    Say FA("فرم پاک شد."), True
End Sub

Private Sub ClearForm()
    Dim ws As Worksheet
    Set ws = FormSheet()
    If ws Is Nothing Then Exit Sub
    ws.Range("B" & FIRST_ITEM & ":C" & LAST_ITEM).ClearContents
    ws.Range("B6:B7").ClearContents
    ws.Range("D4").MergeArea.ClearContents
    ws.Range("D6").Value = 0
    ws.Range("B5").Value = FA("نقد")
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
        Say FA("تاریخ درست نیست. مثل 1405/08/04 بنویسید."), False
        ws.Range("B4").Select
        Exit Sub
    End If

    For r = FIRST_ITEM To LAST_ITEM
        nm = Trim$(CStr(ws.Cells(r, 2).Value))
        If Len(nm) > 0 Then
            If Not IsNumeric(ws.Cells(r, 4).Value) Or Len(CStr(ws.Cells(r, 4).Value)) = 0 Then
                Say FA("ردیف ") & (r - FIRST_ITEM + 1) & FA(": این محصول در منو نیست. از فهرست انتخاب کنید."), False
                ws.Cells(r, 2).Select
                Exit Sub
            End If
            If Not IsNumeric(ws.Cells(r, 3).Value) Or Len(CStr(ws.Cells(r, 3).Value)) = 0 Then
                Say FA("ردیف ") & (r - FIRST_ITEM + 1) & FA(": تعداد را وارد کنید."), False
                ws.Cells(r, 3).Select
                Exit Sub
            End If
            If CDbl(ws.Cells(r, 3).Value) <= 0 Then
                Say FA("ردیف ") & (r - FIRST_ITEM + 1) & FA(": تعداد باید بیشتر از صفر باشد."), False
                ws.Cells(r, 3).Select
                Exit Sub
            End If
            n = n + 1
            names(n) = nm
            qtys(n) = CDbl(ws.Cells(r, 3).Value)
        ElseIf Len(CStr(ws.Cells(r, 3).Value)) > 0 Then
            Say FA("ردیف ") & (r - FIRST_ITEM + 1) & FA(": نام محصول خالی است."), False
            ws.Cells(r, 2).Select
            Exit Sub
        End If
    Next r
    If n = 0 Then
        Say FA("هیچ قلمی وارد نشده است. نام محصول و تعداد را بنویسید."), False
        ws.Range("B" & FIRST_ITEM).Select
        Exit Sub
    End If

    Set hdr = HeaderRow()
    cDate = ColOf(hdr, FA("تاریخ"))
    cName = ColOf(hdr, FA("نام محصول"))
    If cDate = 0 Or cName = 0 Then
        Say FA("ستون‌های شیت فروش پیدا نشد. نام ستون‌ها را تغییر نداده باشید."), False
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
        PutVal rw, hdr, FA("فاکتور روز"), dayNo
        rw.Cells(1, cName).Value = names(i)
        PutVal rw, hdr, FA("تعداد"), qtys(i)
        PutVal rw, hdr, FA("درصد تخفیف"), disc
        PutVal rw, hdr, FA("روش پرداخت"), CStr(ws.Range("B5").Value)
        PutVal rw, hdr, FA("وضعیت"), FA("نهایی")
        PutVal rw, hdr, FA("کد پرسنل"), CStr(ws.Range("D5").Value)
        PutVal rw, hdr, FA("ساعت"), tm
        PutVal rw, hdr, FA("میز/سفارش"), ws.Range("B6").Value
        PutVal rw, hdr, FA("نام مشتری"), CStr(ws.Range("B7").Value)
        PutVal rw, hdr, FA("تلفن"), CStr(ws.Range("D4").Value)
    Next i
    Application.ScreenUpdating = True

    Set inv = InvoiceSheet()
    If Not inv Is Nothing Then inv.Range("I3").Value = invNo
    ClearForm
    Application.Calculate
    Say FA("ثبت شد: فاکتور ") & invNo & FA(" با ") & n & FA(" قلم. برای دیدن آن به شیت «فاکتور» بروید."), True
    If doPrint And Not inv Is Nothing Then inv.PrintOut Copies:=1
End Sub
