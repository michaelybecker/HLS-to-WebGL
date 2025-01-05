import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Global CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Expose-Headers", "*");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

function isValidURL(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Create segments directory if it doesn't exist
const segmentsDir = path.join(__dirname, "segments");
if (!fs.existsSync(segmentsDir)) {
  fs.mkdirSync(segmentsDir);
}

// Track active streams
const activeStreams = new Map();

async function isLiveStream(url) {
  try {
    const { stdout } = await execAsync(
      `yt-dlp --get-id --match-filter "is_live" "${url}"`
    );
    return stdout.trim() !== "";
  } catch {
    return false;
  }
}

async function setupStream(url, outputDir) {
  // Get best format URL using yt-dlp
  const { stdout: videoUrl } = await execAsync(
    `yt-dlp -f "best[height<=720]" -g "${url}"`
  );

  const ffmpegArgs = [
    "-i",
    videoUrl.trim(),
    "-c:v",
    "libx264", // Re-encode video instead of copy
    "-c:a",
    "aac", // Re-encode audio to ensure compatibility
    "-f",
    "hls",
    "-hls_time",
    "2", // Shorter segments for live
    "-hls_list_size",
    "3", // Keep only recent segments for live
    "-hls_flags",
    "delete_segments+independent_segments", // Independent segments for better compatibility
    "-hls_segment_type",
    "mpegts", // Ensure MPEG-TS format
    "-hls_segment_filename",
    path.join(outputDir, "segment%d.ts"),
    "-preset",
    "veryfast", // Fast encoding for live streams
    "-profile:v",
    "baseline", // Most compatible H.264 profile
    "-level",
    "3.0",
    path.join(outputDir, "playlist.m3u8"),
  ];

  const ffmpeg = spawn("ffmpeg", ffmpegArgs);

  ffmpeg.stderr.on("data", (data) => {
    console.log(`ffmpeg: ${data}`);
  });

  return ffmpeg;
}

app.get("/stream", async (req, res) => {
  const url = req.query.url;
  if (!url || !isValidURL(url)) {
    return res.status(400).send("Invalid URL parameter");
  }

  try {
    // Get video ID from URL
    const videoId = url.split("v=")[1].split("&")[0];
    const outputDir = path.join(segmentsDir, videoId);

    // Check if stream is already active
    if (activeStreams.has(videoId)) {
      return res.json({ playlistUrl: `/segments/${videoId}/playlist.m3u8` });
    }

    // Create video-specific directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    } else {
      // Clean up any existing segments
      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        fs.unlinkSync(path.join(outputDir, file));
      }
    }

    const isLive = await isLiveStream(url);
    const ffmpeg = await setupStream(url, outputDir);

    if (isLive) {
      // For live streams, store the ffmpeg process and send response immediately
      activeStreams.set(videoId, ffmpeg);

      // Clean up when ffmpeg exits
      ffmpeg.on("close", (code) => {
        console.log(`Stream ${videoId} ended with code ${code}`);
        activeStreams.delete(videoId);
        // Clean up segments
        if (fs.existsSync(outputDir)) {
          fs.rmSync(outputDir, { recursive: true, force: true });
        }
      });

      res.json({ playlistUrl: `/segments/${videoId}/playlist.m3u8` });
    } else {
      // For VOD, wait for completion
      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          console.error(`ffmpeg process exited with code ${code}`);
          return res.status(500).send("Failed to create HLS stream");
        }
        res.json({ playlistUrl: `/segments/${videoId}/playlist.m3u8` });
      });
    }
  } catch (error) {
    console.error("Error creating stream:", error);
    res.status(500).send("Error creating stream");
  }
});

// Clean up all active streams when server shuts down
process.on("SIGINT", () => {
  console.log("Cleaning up active streams...");
  for (const [videoId, ffmpeg] of activeStreams) {
    ffmpeg.kill();
    const outputDir = path.join(segmentsDir, videoId);
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }
  process.exit(0);
});

// Serve segment files
app.use("/segments", express.static(path.join(__dirname, "segments")));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
