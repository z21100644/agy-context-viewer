"""Read-only attachment inventory. Outputs counts, never cell contents."""
import sys, json, os, re, zipfile, time, xml.etree.ElementTree as ET
sys.path.insert(0, os.path.join(os.environ.get('LOCALAPPDATA', ''), 'AntigravityContextMeter', 'python-packages'))

MAX_BYTES = 256 * 1024 * 1024
MAX_UNPACKED = 512 * 1024 * 1024
MAX_CHARS = 100_000_000

def resolve_lang():
    raw = (os.environ.get('AG_METER_LANG') or os.environ.get('LANG') or 'en').strip().lower().replace('_', '-')
    if 'zh' in raw and any(k in raw for k in ('tw', 'hk', 'mo', 'hant')):
        return 'zh-TW'
    if raw == 'zh' or raw.startswith('zh-'):
        return 'zh-CN'
    return 'en'

LANG = resolve_lang()

PY_I18N = {
    'en': {
        'limit_reached': 'Local scan resource limit reached; stats incomplete',
        'unpacked_512': 'Unpacked size exceeds 512 MiB; local scan incomplete',
        'shared_formula': 'Some shared formulas could not be expanded; counted cached values only',
        'shared_str_err': 'Shared string index error; stats incomplete',
        'no_formula_cache': 'Some formulas lack cached results; formulas not recalculated',
        'embedded_n': lambda n: f'{n} embedded image(s)/object(s) not visually tokenized',
        'ext_links': 'External link targets not read',
        'vba_macro': 'Macro binary content excluded',
        'unpacked_large': 'Unpacked size too large; stats incomplete',
        'embedded_generic': 'Embedded images/objects not visually tokenized',
        'over_256': 'Attachment exceeds 256 MiB; local scan incomplete',
        'xls_formula_cov': 'Cached cell values; legacy formula source not guaranteed',
        'xls_warn': 'XLS counts cached cell values; formulas and embedded objects may be incomplete',
        'xls_html': 'HTML/XML table export disguised as .xls; extracted as text',
        'xlsb_formula_cov': 'Cached cell values',
        'xlsb_warn': 'XLSB counts cached cell values; formulas and embedded objects may be incomplete',
        'pdf_blank': 'Contains textless page(s); scanned image content not fully counted',
        'pdf_img': 'PDF images not visually tokenized',
        'img_label': 'Image',
        'unsupported': 'Attachment type not supported for content parsing; marked as unknown',
    },
    'zh-CN': {
        'limit_reached': '达到本地扫描资源上限，统计不完整',
        'unpacked_512': '解压后大小超过 512 MiB，本地扫描未完成',
        'shared_formula': '部分共享公式无法展开，仅计入已保存的值',
        'shared_str_err': '共享字符串索引异常，统计不完整',
        'no_formula_cache': '部分公式无缓存结果，未重新计算公式',
        'embedded_n': lambda n: f'{n} 个内嵌图片/对象未执行视觉分词',
        'ext_links': '外部链接目标内容未读取',
        'vba_macro': '宏二进制内容未计入',
        'unpacked_large': '解压后大小过大，统计不完整',
        'embedded_generic': '内嵌图片/对象未执行视觉分词',
        'over_256': '附件超过 256 MiB，本地扫描未完成',
        'xls_formula_cov': '已保存的单元格值；旧格式公式源码不保证可见',
        'xls_warn': 'XLS 计入已保存的单元格值；公式源码、内嵌对象不保证完整',
        'xls_html': '文件为 HTML/XML 格式的表格导出，已按文本提取',
        'xlsb_formula_cov': '已保存的单元格值',
        'xlsb_warn': 'XLSB 计入已保存的单元格值；公式源码、内嵌对象不保证完整',
        'pdf_blank': '存在无文字页面，扫描图内容未计全',
        'pdf_img': 'PDF 图片未执行视觉分词',
        'img_label': '图片',
        'unsupported': '此附件类型暂不支持内容解析，明确列为未知',
    },
    'zh-TW': {
        'limit_reached': '達到本機掃描資源上限，統計不完整',
        'unpacked_512': '解壓縮後大小超過 512 MiB，本機掃描未完成',
        'shared_formula': '部分共用公式無法展開，僅計入已儲存的值',
        'shared_str_err': '共用字串索引異常，統計不完整',
        'no_formula_cache': '部分公式無快取結果，未重新計算公式',
        'embedded_n': lambda n: f'{n} 個內嵌圖片/物件未執行視覺分詞',
        'ext_links': '外部連結目標內容未讀取',
        'vba_macro': '巨集二進位內容未計入',
        'unpacked_large': '解壓縮後大小過大，統計不完整',
        'embedded_generic': '內嵌圖片/物件未執行視覺分詞',
        'over_256': '附件超過 256 MiB，本機掃描未完成',
        'xls_formula_cov': '已儲存的儲存格值；舊格式公式原始碼不保證可見',
        'xls_warn': 'XLS 計入已儲存的儲存格值；公式原始碼、內嵌物件不保證完整',
        'xls_html': '檔案為 HTML/XML 格式的表格匯出，已依文字擷取',
        'xlsb_formula_cov': '已儲存的儲存格值',
        'xlsb_warn': 'XLSB 計入已儲存的儲存格值；公式原始碼、內嵌物件不保證完整',
        'pdf_blank': '存在無文字頁面，掃描圖內容未計全',
        'pdf_img': 'PDF 圖片未執行視覺分詞',
        'img_label': '圖片',
        'unsupported': '此附件類型暫不支援內容解析，明確列為未知',
    },
}

T = PY_I18N[LANG]

class Counter:
    def __init__(self):
        self.chars = self.bytes = self.cjk = 0
        self.deadline = time.monotonic() + 45
    def add(self, value):
        text = '' if value is None else str(value)
        self.chars += len(text)
        self.bytes += len(text.encode('utf-8', errors='replace'))
        self.cjk += len(re.findall(r'[\u2e80-\u9fff\uf900-\ufaff]', text))
        if self.chars > MAX_CHARS or time.monotonic() > self.deadline:
            raise ValueError(T['limit_reached'])
    def result(self):
        import math
        mid = (self.chars - self.cjk) / 4 + self.cjk * 1.2
        return dict(chars=self.chars, bytes=self.bytes, low=math.ceil(mid * .7), high=math.ceil(max(mid * 1.6, self.bytes / 2)))

def local(tag):
    return tag.rsplit('}', 1)[-1]

def xlsx_scan(path, counter, result):
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if sum(i.file_size for i in infos) > MAX_UNPACKED:
            raise ValueError(T['unpacked_512'])
        names = set(z.namelist())
        strings = []
        if 'xl/sharedStrings.xml' in names:
            with z.open('xl/sharedStrings.xml') as f:
                for event, e in ET.iterparse(f, events=('end',)):
                    if local(e.tag) == 'si':
                        strings.append(''.join(t.text or '' for t in e.iter() if local(t.tag) == 't'))
                        e.clear()
        result.update(sheets=0, hiddenSheets=0, cells=0, formulas=0)
        if 'xl/workbook.xml' in names:
            workbook = ET.fromstring(z.read('xl/workbook.xml'))
            for e in workbook.iter():
                if local(e.tag) == 'sheet':
                    counter.add(e.attrib.get('name', ''))
                    if e.attrib.get('state') in ('hidden', 'veryHidden'):
                        result['hiddenSheets'] += 1
        for name in sorted(names):
            if not re.fullmatch(r'xl/worksheets/[^/]+\.xml', name):
                continue
            result['sheets'] += 1
            shared_formulas = {}
            with z.open(name) as f:
                for event, e in ET.iterparse(f, events=('end',)):
                    tag = local(e.tag)
                    if tag == 'c':
                        typ = e.attrib.get('t', '')
                        value = next((x.text or '' for x in e if local(x.tag) == 'v'), '')
                        formula_node = next((x for x in e if local(x.tag) == 'f'), None)
                        formula = formula_node.text or '' if formula_node is not None else ''
                        if formula_node is not None and formula_node.attrib.get('t') == 'shared':
                            shared_id = formula_node.attrib.get('si', '')
                            if formula:
                                shared_formulas[shared_id] = (e.attrib.get('r'), formula)
                            else:
                                try:
                                    from openpyxl.formula.translate import Translator
                                    origin, original = shared_formulas[shared_id]
                                    formula = Translator('=' + original, origin=origin).translate_formula(e.attrib['r']).lstrip('=')
                                except Exception:
                                    warning = T['shared_formula']
                                    if warning not in result['unknownParts']: result['unknownParts'].append(warning)
                        if typ == 's' and value:
                            try: value = strings[int(value)]
                            except (IndexError, ValueError): raise ValueError(T['shared_str_err'])
                        elif typ == 'inlineStr':
                            value = ''.join(x.text or '' for x in e.iter() if local(x.tag) == 't')
                        if formula:
                            counter.add('=' + formula)
                            result['formulas'] += 1
                            if not value:
                                warning = T['no_formula_cache']
                                if warning not in result['unknownParts']: result['unknownParts'].append(warning)
                        if value or formula:
                            result['cells'] += 1
                            counter.add(value)
                            counter.add('\t')
                        e.clear()
                    elif tag == 'row':
                        e.clear()
        for name in sorted(names):
            if re.fullmatch(r'xl/(?:comments[^/]*|drawings/[^/]+|charts/[^/]+)\.xml', name):
                root = ET.fromstring(z.read(name))
                for e in root.iter():
                    if local(e.tag) in ('t', 'text') and e.text:
                        counter.add(e.text)
        embedded = sum(1 for n in names if n.startswith(('xl/media/', 'xl/embeddings/')))
        if embedded:
            result['unknownParts'].append(T['embedded_n'](embedded))
        if any(n.startswith('xl/externalLinks/') for n in names):
            result['unknownParts'].append(T['ext_links'])
        if 'xl/vbaProject.bin' in names:
            result['unknownParts'].append(T['vba_macro'])

def office_xml(path, counter, result, prefix):
    with zipfile.ZipFile(path) as z:
        if sum(i.file_size for i in z.infolist()) > MAX_UNPACKED:
            raise ValueError(T['unpacked_large'])
        for name in z.namelist():
            if name.startswith(prefix) and name.endswith('.xml'):
                root = ET.fromstring(z.read(name))
                for e in root.iter():
                    if local(e.tag) in ('t', 'v') and e.text: counter.add(e.text)
        if any('/media/' in n or '/embeddings/' in n for n in z.namelist()):
            result['unknownParts'].append(T['embedded_generic'])

def scan(item):
    path = item['path']
    ext = os.path.splitext(path)[1].lower() if path else ''
    result = dict(key=item['key'], status='parsed', unknownParts=[], **Counter().result())
    counter = Counter()
    try:
        size = os.path.getsize(path)
        result['fileBytes'] = size
        if size > MAX_BYTES: raise ValueError(T['over_256'])
        if ext in ('.xlsx', '.xlsm', '.xltx', '.xltm'):
            xlsx_scan(path, counter, result)
        elif ext == '.xls':
            try:
                import xlrd, io
                book = xlrd.open_workbook(path, on_demand=True, logfile=io.StringIO())
                result.update(sheets=book.nsheets, hiddenSheets=0, cells=0, formulaCoverage=T['xls_formula_cov'])
                try:
                    for n in range(book.nsheets):
                        sheet = book.sheet_by_index(n)
                        counter.add(sheet.name)
                        if sheet.visibility: result['hiddenSheets'] += 1
                        for row in sheet.get_rows():
                            for cell in row:
                                if cell.ctype not in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK):
                                    counter.add(cell.value); counter.add('\t'); result['cells'] += 1
                        book.unload_sheet(n)
                finally: book.release_resources()
                result['unknownParts'].append(T['xls_warn'])
            except Exception as xls_err:
                try:
                    with open(path, 'rb') as f:
                        raw = f.read()
                    sample = raw[:4096].lower()
                    if b'<html' in sample or b'<table' in sample or b'<?xml' in sample:
                        text = None
                        for encoding in ('utf-8-sig', 'utf-16', 'utf-8', 'big5', 'gb18030', 'gbk'):
                            try: text = raw.decode(encoding); break
                            except UnicodeError: pass
                        if text is not None:
                            counter.add(text)
                            result['unknownParts'].append(T['xls_html'])
                        else:
                            raise xls_err
                    else:
                        raise xls_err
                except Exception:
                    raise xls_err
        elif ext == '.xlsb':
            from pyxlsb import open_workbook
            with open_workbook(path) as book:
                result.update(sheets=len(book.sheets), cells=0, formulaCoverage=T['xlsb_formula_cov'])
                for n, name in enumerate(book.sheets, 1):
                    counter.add(name)
                    with book.get_sheet(n) as sheet:
                        for row in sheet.rows(sparse=True):
                            for cell in row:
                                if cell.v is not None:
                                    counter.add(cell.v); counter.add('\t'); result['cells'] += 1
            result['unknownParts'].append(T['xlsb_warn'])
        elif ext == '.docx': office_xml(path, counter, result, 'word/')
        elif ext == '.pptx': office_xml(path, counter, result, 'ppt/')
        elif ext == '.pdf':
            from pypdf import PdfReader
            reader = PdfReader(path)
            result['pages'] = len(reader.pages)
            for page in reader.pages:
                text = page.extract_text() or ''
                counter.add(text)
                if not text.strip(): result['unknownParts'].append(T['pdf_blank'])
                if page.images: result['unknownParts'].append(T['pdf_img'])
        elif ext in ('.txt', '.csv', '.tsv', '.md', '.json', '.jsonl', '.xml', '.yaml', '.yml', '.html', '.htm', '.log', '.py', '.js', '.ts', '.css', '.sql', '.rtf'):
            with open(path, 'rb') as text_file:
                raw = text_file.read()
            text = None
            for encoding in ('utf-8-sig', 'utf-16', 'utf-8', 'big5', 'gb18030', 'gbk', 'latin1'):
                try: text = raw.decode(encoding); break
                except UnicodeError: pass
            if text is None: text = raw.decode('utf-8', errors='replace')
            counter.add(text)
        elif ext in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif'):
            w, h = None, None
            try:
                from PIL import Image
                with Image.open(path) as image:
                    w, h = image.size
            except Exception:
                pass
            if not w or not h:
                w, h = parse_image_dimensions_file(path)
            import math
            if w and h:
                result['width'] = w
                result['height'] = h
                result['chars'] = 0
                result['dimensions'] = f"{w}×{h}"
                if w <= 384 and h <= 384:
                    tok = 258
                else:
                    tiles = math.ceil(w / 768) * math.ceil(h / 768)
                    tok = tiles * 258
                result['low'] = tok
                result['high'] = max(tok, 1120 if (w > 384 or h > 384) else 258)
            else:
                result['low'] = 258
                result['high'] = 1120
                result['chars'] = 0
                result['dimensions'] = T['img_label']
            result['status'] = 'parsed'
        else:
            raise ValueError(T['unsupported'])
    except Exception as e:
        result['unknownParts'].append(str(e)[:180])
    c_res = counter.result()
    if ext in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif') and result.get('low'):
        result['bytes'] = result.get('fileBytes') or c_res['bytes']
    else:
        result.update(c_res)
    result['unknownParts'] = list(dict.fromkeys(result['unknownParts']))
    if result['unknownParts']: result['status'] = 'partial' if counter.chars else 'unknown'
    return result

def parse_image_dimensions_file(path):
    import struct
    try:
        with open(path, 'rb') as f:
            head = f.read(64)
            if head.startswith(b'\x89PNG\r\n\x1a\n') and len(head) >= 24:
                return struct.unpack('>II', head[16:24])
            if head.startswith(b'GIF87a') or head.startswith(b'GIF89a'):
                return struct.unpack('<HH', head[6:10])
            if head.startswith(b'BM') and len(head) >= 26:
                w, h = struct.unpack('<ii', head[18:26])
                return abs(w), abs(h)
            if head.startswith(b'\xff\xd8'):
                f.seek(0)
                data = f.read(65536)
                idx = 2
                while idx < len(data) - 9:
                    if data[idx] == 0xff and data[idx+1] in (0xc0, 0xc1, 0xc2, 0xc3):
                        h, w = struct.unpack('>HH', data[idx+5:idx+9])
                        return w, h
                    elif data[idx] == 0xff:
                        length = struct.unpack('>H', data[idx+2:idx+4])[0]
                        idx += 2 + length
                    else:
                        idx += 1
    except Exception:
        pass
    return None, None

if __name__ == '__main__':
    payload = json.load(sys.stdin)
    if '--json-lines' in sys.argv:
        for item in payload:
            print(json.dumps(scan(item), ensure_ascii=True), flush=True)
    else:
        json.dump([scan(item) for item in payload], sys.stdout, ensure_ascii=True)
