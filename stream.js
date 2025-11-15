const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const STREAM_WIDTH = 1920;
const STREAM_HEIGHT = 1080;
const FPS = 30;
const FRAME_INTERVAL = 1000 / FPS;

// YouTube RTMP URL format: rtmp://a.rtmp.youtube.com/live2/{STREAM_KEY}
const STREAM_KEY = process.env.YOUTUBE_STREAM_KEY;
if (!STREAM_KEY) {
  console.error('Error: YOUTUBE_STREAM_KEY environment variable is not set');
  process.exit(1);
}
const YOUTUBE_RTMP_URL = `rtmp://a.rtmp.youtube.com/live2/${STREAM_KEY}`;

let browser;
let page;
let ffmpegProcess;
let lastFrameTime = 0;

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

  const htmlPath = `file://${path.resolve(__dirname, 'index.html')}`;
  console.log(`Loading page: ${htmlPath}`);
  await page.goto(htmlPath, { waitUntil: 'networkidle0' });
  
  // Wait for p5.js to initialize
  await page.waitForFunction(() => {
    return typeof window.draw === 'function';
  }, { timeout: 5000 });

  console.log('Browser initialized and sketch loaded');
}

function initFFmpeg() {
  console.log(`Starting FFmpeg stream to: ${YOUTUBE_RTMP_URL}`);
  
  ffmpegProcess = spawn('ffmpeg', [
    '-f', 'rawvideo',
    '-pixel_format', 'rgba',
    '-video_size', `${STREAM_WIDTH}x${STREAM_HEIGHT}`,
    '-framerate', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-b:v', '5000k',
    '-maxrate', '5000k',
    '-bufsize', '10000k',
    '-pix_fmt', 'yuv420p',
    '-g', String(FPS * 2),
    '-f', 'flv',
    YOUTUBE_RTMP_URL
  ]);

  ffmpegProcess.stderr.on('data', (data) => {
    console.log(`[FFmpeg] ${data.toString().trim()}`);
  });

  ffmpegProcess.on('error', (err) => {
    console.error('FFmpeg error:', err);
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
  });
}

async function captureAndStream() {
  try {
    const now = Date.now();
    
    // Throttle to target FPS
    if (now - lastFrameTime < FRAME_INTERVAL) {
      return;
    }
    lastFrameTime = now;

    // Capture screenshot as buffer
    const screenshot = await page.screenshot({
      encoding: 'binary',
      type: 'png'
    });

    // Convert PNG to raw RGBA for FFmpeg
    const sharp = require('sharp');
    const rawBuffer = await sharp(screenshot)
      .raw()
      .toBuffer();

    // Write to FFmpeg stdin
    if (ffmpegProcess && ffmpegProcess.stdin.writable) {
      ffmpegProcess.stdin.write(rawBuffer);
    }

  } catch (error) {
    console.error('Capture error:', error);
  }
}

async function start() {
  try {
    await initBrowser();
    initFFmpeg();

    console.log('Starting stream capture loop...');
    console.log(`Streaming at ${STREAM_WIDTH}x${STREAM_HEIGHT} @ ${FPS}fps`);

    // Capture frames continuously
    const captureInterval = setInterval(captureAndStream, 16); // ~60fps capture, throttled to 30fps output

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      clearInterval(captureInterval);
      
      if (ffmpegProcess) {
        ffmpegProcess.stdin.end();
        await new Promise(resolve => ffmpegProcess.on('close', resolve));
      }
      
      if (browser) {
        await browser.close();
      }
      
      process.exit(0);
    });

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

start();
