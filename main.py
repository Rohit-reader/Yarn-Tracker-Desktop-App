import sys
import os
import subprocess
import time
import threading
import requests
from PyQt6.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QWidget, 
                             QLabel, QProgressBar, QStackedWidget)
from PyQt6.QtGui import QPixmap, QColor, QFont
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtCore import QUrl, Qt, QTimer

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

class YarnTrackerApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Yarn Roll Tracking System")
        self.setMinimumSize(1280, 800)
        
        # Set app-wide background color to eliminate white flashes
        self.setStyleSheet("background-color: #f8fafc;")
        
        # Stacked widget for Splash vs Main App
        self.stack = QStackedWidget()
        self.setCentralWidget(self.stack)
        
        # --- PAGE 1: SPLASH SCREEN ---
        self.splash_page = QWidget()
        self.splash_page.setStyleSheet("background-color: #f8fafc;")
        self.splash_layout = QVBoxLayout(self.splash_page)
        self.splash_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Logo in a nice square box
        self.logo_label = QLabel()
        logo_pixmap = QPixmap(resource_path("logo.png"))
        if not logo_pixmap.isNull():
            self.logo_label.setPixmap(logo_pixmap.scaled(180, 180, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        self.logo_label.setStyleSheet("border: 2px solid #f97316; border-radius: 15px; padding: 25px; background: #ffffff;")
        self.splash_layout.addWidget(self.logo_label, alignment=Qt.AlignmentFlag.AlignCenter)
        
        # Pulsing Loader Text
        self.loader_label = QLabel("INITIALIZING WAREHOUSE SYSTEM...")
        self.loader_label.setStyleSheet("color: #f97316; font-size: 14px; font-weight: bold; margin-top: 30px; font-family: 'Segoe UI';")
        self.splash_layout.addWidget(self.loader_label, alignment=Qt.AlignmentFlag.AlignCenter)
        
        # Progress Bar
        self.progress = QProgressBar()
        self.progress.setFixedWidth(400)
        self.progress.setStyleSheet("""
            QProgressBar { border: 2px solid #e2e8f0; border-radius: 10px; text-align: center; background: #ffffff; height: 8px; }
            QProgressBar::chunk { background-color: #f97316; border-radius: 8px; }
        """)
        self.progress.setRange(0, 0) # Indeterminate
        self.splash_layout.addWidget(self.progress, alignment=Qt.AlignmentFlag.AlignCenter)
        
        self.stack.addWidget(self.splash_page)
        
        # --- PAGE 2: MAIN BROWSER ---
        self.main_page = QWidget()
        self.main_layout = QVBoxLayout(self.main_page)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        
        self.browser = QWebEngineView()
        self.browser.page().setBackgroundColor(QColor("#f8fafc")) # CRITICAL: No white background
        self.main_layout.addWidget(self.browser)
        
        self.stack.addWidget(self.main_page)
        
        # State tracking
        self.server_ready = False
        self.page_loaded = False
        
        # Start server and monitoring
        self.start_backend()
        
        # Transition when everything is ready
        self.browser.loadFinished.connect(self.on_page_loaded)

    def start_backend(self):
        backend_dir = resource_path("backend")
        def run_server():
            # Cleanup old processes
            if sys.platform == "win32":
                subprocess.run('taskkill /F /IM node.exe /T', shell=True, capture_output=True)
            subprocess.run(["node", "server.js"], cwd=backend_dir, shell=True)
            
        threading.Thread(target=run_server, daemon=True).start()
        
        # Polling for server availability
        self.poll_timer = QTimer()
        self.poll_timer.timeout.connect(self.poll_server)
        self.poll_timer.start(1000)

    def poll_server(self):
        try:
            # Check if backend is responding
            response = requests.get("http://localhost:5000/api/health", timeout=1)
            if response.status_code == 200:
                self.poll_timer.stop()
                self.server_ready = True
                # Start loading the actual page in the background
                self.browser.setUrl(QUrl("http://localhost:5000/index.html"))
        except:
            pass

    def on_page_loaded(self):
        self.page_loaded = True
        # Only switch when server is ready AND page is fully rendered
        if self.server_ready:
            # Small delay to ensure render is visible
            QTimer.singleShot(500, lambda: self.stack.setCurrentIndex(1))

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = YarnTrackerApp()
    window.show()
    sys.exit(app.exec())
