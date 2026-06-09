import http.server, json, os, sys, socketserver, threading

PORT = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else '8083'))
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sync-data.json')

class SyncHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/favicon.ico':
            self.send_response(204); self.end_headers(); return
        if self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.wfile.write(b'{}')
            return
        return super().do_GET()
    def do_PUT(self):
        if self.path == '/api/data':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode('utf-8'))
            return
        self.send_response(404); self.end_headers()
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    def log_message(self, format, *args):
        try:
            if len(args) >= 3:
                print(f'[{self.log_date_time_string()}] {args[0]} {args[1]} {args[2]}')
            else:
                print(f'[{self.log_date_time_string()}] {" ".join(str(a) for a in args)}')
        except: pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
SyncHandler.extensions_map.update({
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
})

with socketserver.TCPServer(('0.0.0.0', PORT), SyncHandler) as httpd:
    httpd.allow_reuse_address = True
    print(f'Serving at http://0.0.0.0:{PORT}')
    httpd.serve_forever()
