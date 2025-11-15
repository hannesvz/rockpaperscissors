require('dotenv').config();
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const STREAM_WIDTH = 1280;
const STREAM_HEIGHT = 720;
const FPS = 30;
const DATA_FILE = path.join(__dirname, 'scores', 'game_data.json');

// Ensure scores directory exists
const scoresDir = path.join(__dirname, 'scores');
if (!fs.existsSync(scoresDir)) {
  fs.mkdirSync(scoresDir, { recursive: true });
}

// Initialize game data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  const defaultData = {
    match: 1,
    scores: [0, 0, 0]
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
}

// Stream configuration
const TEST_MODE = process.env.TEST_MODE === 'true';
const STREAM_TARGETS = [];

if (TEST_MODE) {
  console.log('Running in TEST MODE - output will be saved to output.mp4');
  STREAM_TARGETS.push({
    name: 'test',
    url: 'output.mp4',
    format: 'mp4'
  });
} else {
  // YouTube
  if (process.env.YOUTUBE_ENABLED === 'true') {
    const YOUTUBE_KEY = process.env.YOUTUBE_STREAM_KEY;
    if (!YOUTUBE_KEY) {
      console.error('Error: YOUTUBE_ENABLED is true but YOUTUBE_STREAM_KEY is not set');
      process.exit(1);
    }
    STREAM_TARGETS.push({
      name: 'YouTube',
      url: `rtmp://a.rtmp.youtube.com/live2/${YOUTUBE_KEY}`,
      format: 'flv'
    });
  }
  
  // Twitch
  if (process.env.TWITCH_ENABLED === 'true') {
    const TWITCH_KEY = process.env.TWITCH_STREAM_KEY;
    if (!TWITCH_KEY) {
      console.error('Error: TWITCH_ENABLED is true but TWITCH_STREAM_KEY is not set');
      process.exit(1);
    }
    STREAM_TARGETS.push({
      name: 'Twitch',
      url: `rtmp://live-iad.twitch.tv/live/${TWITCH_KEY}`,
      format: 'flv'
    });
  }
  
  if (STREAM_TARGETS.length === 0) {
    console.error('Error: No streaming services enabled');
    console.error('Set YOUTUBE_ENABLED=true and/or TWITCH_ENABLED=true in .env');
    console.error('For testing, use: TEST_MODE=true npm start');
    process.exit(1);
  }
}

let browser;
let page;
let ffmpegProcesses = [];
let httpServer;

function startHttpServer() {
  return new Promise((resolve) => {
    httpServer = http.createServer((req, res) => {
      // API endpoints
      if (req.url === '/api/game-data' && req.method === 'GET') {
        try {
          const data = fs.readFileSync(DATA_FILE, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (err) {
          res.writeHead(500);
          res.end('Error reading game data');
        }
        return;
      }
      
      if (req.url === '/api/game-data' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            console.log('Saving game data:', data);
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
            console.log('Game data saved to:', DATA_FILE);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            console.error('Error saving game data:', err);
            res.writeHead(400);
            res.end('Invalid JSON');
          }
        });
        return;
      }
      
      // Static files
      const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        
        const ext = path.extname(filePath);
        const contentTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.mp3': 'audio/mpeg',
          '.json': 'application/json'
        };
        
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    
    httpServer.listen(8080, () => {
      console.log('HTTP server started on http://localhost:8080');
      resolve();
    });
  });
}

async function initBrowser() {
  console.log('Launching headless browser...');
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  });

  page = await browser.newPage();
  
  // Set viewport to stream resolution
  await page.setViewport({
    width: STREAM_WIDTH,
    height: STREAM_HEIGHT,
    deviceScaleFactor: 1
  });

  console.log('Loading page: http://localhost:8080');
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
  
  // Wait for p5.js to initialize
  await page.waitForFunction(() => {
    return typeof window.draw === 'function';
  }, { timeout: 5000 });

  console.log('Browser initialized and sketch loaded');
}

function initFFmpeg() {
  STREAM_TARGETS.forEach((target) => {
    console.log(`Starting FFmpeg stream to ${target.name}: ${target.url}`);
    
    const ffmpegArgs = [
      '-f', 'image2pipe',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', '5000k',
      '-maxrate', '5000k',
      '-bufsize', '10000k',
      '-pix_fmt', 'yuv420p',
      '-g', String(FPS * 2),
      '-framerate', String(FPS),
      '-an',
      '-f', target.format,
      target.url
    ];

    const process = spawn('ffmpeg', ffmpegArgs);

    process.stderr.on('data', (data) => {
      console.log(`[FFmpeg ${target.name}] ${data.toString().trim()}`);
    });

    process.on('error', (err) => {
      console.error(`FFmpeg ${target.name} error:`, err);
    });

    process.on('close', (code) => {
      console.log(`FFmpeg ${target.name} exited with code ${code}`);
    });

    ffmpegProcesses.push(process);
  });
}

async function captureAndStream() {
  try {
    // Capture screenshot as PNG buffer
    const screenshot = await page.screenshot({
      encoding: 'binary',
      type: 'png'
    });

    // Write PNG to all FFmpeg processes
    ffmpegProcesses.forEach((process) => {
      if (process && process.stdin.writable) {
        process.stdin.write(screenshot);
      }
    });

  } catch (error) {
    console.error('Capture error:', error);
  }
}

async function start() {
  try {
    await startHttpServer();
    await initBrowser();
    initFFmpeg();

    console.log('Starting stream capture loop...');
    console.log(`Streaming at ${STREAM_WIDTH}x${STREAM_HEIGHT} @ ${FPS}fps`);

    // Capture frames continuously (sketch runs at 30fps, capture every frame)
    const captureInterval = setInterval(captureAndStream, 1000 / FPS);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      clearInterval(captureInterval);
      
      // Close all FFmpeg processes
      ffmpegProcesses.forEach((proc) => {
        if (proc) {
          proc.stdin.end();
        }
      });
      
      // Wait for all processes to close
      await Promise.all(ffmpegProcesses.map(proc => 
        new Promise(resolve => proc.on('close', resolve))
      ));
      
      if (browser) {
        await browser.close();
      }
      
      if (httpServer) {
        httpServer.close();
      }
      
      process.exit(0);
    });

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

start();
