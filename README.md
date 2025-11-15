# Rock Paper Scissors YouTube Stream

Headless p5.js sketch that streams a rock-paper-scissors battle simulation directly to YouTube.

## Setup

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Configure `.env` file:
```bash
cp .env.example .env
```

3. Edit `.env` with your settings:
```
YOUTUBE_ENABLED=true
YOUTUBE_STREAM_KEY=your_youtube_key

TWITCH_ENABLED=false
TWITCH_STREAM_KEY=your_twitch_key

TEST_MODE=false
```

4. Run the stream:
```bash
npm start
```

### Configuration

- `YOUTUBE_ENABLED` - Enable/disable YouTube streaming (true/false)
- `YOUTUBE_STREAM_KEY` - Your YouTube stream key
- `TWITCH_ENABLED` - Enable/disable Twitch streaming (true/false)
- `TWITCH_STREAM_KEY` - Your Twitch stream key
- `TEST_MODE` - Save to `output.mp4` instead of streaming (true/false)

### Docker (Recommended for Production)

1. Build the image:
```bash
docker build -t rps-stream .
```

2. Run the container:
```bash
docker run \
  -e YOUTUBE_ENABLED=true \
  -e YOUTUBE_STREAM_KEY="your_youtube_key" \
  -e TWITCH_ENABLED=false \
  -e TWITCH_STREAM_KEY="your_twitch_key" \
  rps-stream
```

### Data Storage

Game data (match count and scores) is stored in `scores/game_data.json` and persists between runs.

**Docker with persistent scores (YouTube only):**
```bash
docker run \
  -v /path/to/scores:/app/scores \
  -e YOUTUBE_ENABLED=true \
  -e YOUTUBE_STREAM_KEY="your_youtube_key" \
  rps-stream
```

**Docker with both YouTube and Twitch:**
```bash
docker run \
  -v /path/to/scores:/app/scores \
  -e YOUTUBE_ENABLED=true \
  -e YOUTUBE_STREAM_KEY="your_youtube_key" \
  -e TWITCH_ENABLED=true \
  -e TWITCH_STREAM_KEY="your_twitch_key" \
  rps-stream
```

The scores directory will be created automatically if it doesn't exist. If `game_data.json` is deleted, it will be recreated with match 1 and all scores at 0.

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

## Testing Locally

Before you have a YouTube Stream Key, test the setup by recording to a local MP4 file:

```bash
TEST_MODE=true npm start
```

This will create an `output.mp4` file in the project directory. Let it run for a few seconds, then press `Ctrl+C` to stop. You can then play the video to verify everything is working.

## Troubleshooting

- **FFmpeg not found**: Install ffmpeg (`apt-get install ffmpeg` on Linux, `brew install ffmpeg` on macOS)
- **Stream not connecting**: Verify your YouTube Stream Key is correct
- **High CPU usage**: Reduce FPS or bitrate in `stream.js`
- **Memory issues**: Run with `--max-old-space-size=2048` flag

## Stopping the Stream

Press `Ctrl+C` to gracefully shut down the stream.
