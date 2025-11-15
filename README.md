# Rock Paper Scissors YouTube Stream

Headless p5.js sketch that streams a rock-paper-scissors battle simulation directly to YouTube.

## Setup

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Get your YouTube Stream Key:
   - Go to YouTube Studio → Create → Go Live
   - Copy your Stream Key from the Stream Settings

3. Run the stream:
```bash
YOUTUBE_STREAM_KEY="your_stream_key_here" npm start
```

### Docker (Recommended for Production)

1. Build the image:
```bash
docker build -t rps-stream .
```

2. Run the container:
```bash
docker run -e YOUTUBE_STREAM_KEY="your_stream_key_here" rps-stream
```

## How It Works

- **Puppeteer** launches a headless Chrome browser and loads the p5.js sketch
- **Sharp** converts PNG screenshots to raw RGBA frames
- **FFmpeg** encodes frames in real-time and streams to YouTube via RTMP
- The sketch runs at 60fps internally, but streams at 30fps to YouTube

## Configuration

- `STREAM_WIDTH`: 1920 (pixels)
- `STREAM_HEIGHT`: 1080 (pixels)
- `FPS`: 30 (frames per second)
- `BITRATE`: 5000k (kbps)

Adjust these in `stream.js` if needed.

## Troubleshooting

- **FFmpeg not found**: Install ffmpeg (`apt-get install ffmpeg` on Linux, `brew install ffmpeg` on macOS)
- **Stream not connecting**: Verify your YouTube Stream Key is correct
- **High CPU usage**: Reduce FPS or bitrate in `stream.js`
- **Memory issues**: Run with `--max-old-space-size=2048` flag

## Stopping the Stream

Press `Ctrl+C` to gracefully shut down the stream.
